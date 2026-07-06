// server/routes/jobs.js
const express  = require('express');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult, query } = require('express-validator');
const jwt      = require('jsonwebtoken');
require('dotenv').config();
const db       = require('../db');
const { requireAuth }       = require('../middleware/auth');
const { uploadIdPhoto }     = require('../utils/upload');
const { isPosterOldEnough } = require('../utils/ageCheck');
const { validateZipState, validatePhone, validateIdNumber, validateEmailDomain, validateFullName } = require('../utils/validate');

const router = express.Router();

// Stripe — used only in the release route for the actual payout transfer
const STRIPE_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const stripe = /^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(STRIPE_KEY)
  ? require('stripe')(STRIPE_KEY)
  : null;

const CATEGORIES = [
  'Errands & Delivery',
  'Yard & Outdoor',
  'Cleaning & Tidying',
  'Heavy Moving & Hauling',
  'Furniture Assembly',
  'Pet Care',
  'Tech Help',
  'Tutoring & Academic',
  'Event Staffing',
  'Grocery & Shopping',
  'Snow & Ice',
  'Babysitting & Childcare',
];

// Prohibited keywords — checked on job title + description (case-insensitive)
const PROHIBITED_KEYWORDS = [
  'electrical', 'wiring', 'circuit breaker',
  'plumbing', 'pipe fitting', 'sewer',
  'roofing', 'roof repair',
  'tree climbing', 'chainsaw',
  'firearm', 'weapon', 'gun', 'ammunition',
  'hazardous chemical', 'pesticide', 'asbestos',
  'medical', 'nursing', 'injection', 'prescription',
  'drug', 'alcohol service', 'bartend',
  'passenger transport', 'rideshare', 'driving people',
  'overnight childcare',
];

// ── GET /api/jobs — public list ─────────────────────────────
router.get('/', [
  query('category').optional().trim(),
  query('city').optional().trim(),
  query('zip').optional().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
], (req, res) => {
  const page   = parseInt(req.query.page) || 1;
  const limit  = 12;
  const offset = (page - 1) * limit;

  let where    = "WHERE j.status = 'open'";
  const params = [];

  if (req.query.category) { where += ' AND j.category = ?';       params.push(req.query.category); }
  if (req.query.city)     { where += ' AND LOWER(j.city) LIKE ?'; params.push(`%${req.query.city.toLowerCase()}%`); }
  if (req.query.zip)      { where += ' AND j.zip = ?';            params.push(req.query.zip); }

  const jobs  = db.prepare(`
    SELECT id, poster_name, title, description, category, pay, city, state, zip, status, created_at,
           has_pets, has_stairs, heavy_lifting, duration_estimate
    FROM jobs j ${where}
    ORDER BY j.created_at DESC LIMIT ? OFFSET ?
  `).all([...params, limit, offset]);

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM jobs j ${where}`).get(params).cnt;
  return res.json({ jobs, total, page, pages: Math.ceil(total / limit) });
});

// ── GET /api/jobs/mine/poster — poster views their own jobs ─
// Auth: poster_email in query param (no account required)
router.get('/mine/poster', (req, res) => {
  const email = (req.query.poster_email || '').toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  const search = (req.query.search || '').trim().toLowerCase();

  let sql = `
    SELECT id, title, category, city, state, pay, status, created_at
    FROM jobs
    WHERE poster_email = ?
    AND status != 'cancelled'
  `;
  const params = [email];

  if (search) {
    sql += ' AND LOWER(title) LIKE ?';
    params.push(`%${search}%`);
  }

  sql += ' ORDER BY created_at DESC LIMIT 50';

  const jobs = db.prepare(sql).all(params);
  return res.json({ jobs });
});

// ── GET /api/jobs/categories ────────────────────────────────
router.get('/categories', (req, res) => res.json({ categories: CATEGORIES }));

// ── GET /api/jobs/mine/student ──────────────────────────────
router.get('/mine/student', requireAuth, (req, res) => {
  const jobs = db.prepare(`
    SELECT j.id, j.poster_name, j.title, j.category, j.pay, j.city, j.state,
           j.address, j.status, j.created_at, a.status AS application_status, a.id AS application_id,
           (SELECT COUNT(*) FROM ratings r WHERE r.job_id = j.id AND r.rated_by = 'poster') AS student_rated_poster
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.student_id = ?
    ORDER BY a.created_at DESC
  `).all(req.user.id);
  return res.json({ jobs });
});

// ── GET /api/jobs/:id ───────────────────────────────────────
router.get('/:id', (req, res) => {
  const job = db.prepare(`
    SELECT id, poster_name, title, description, category, pay,
           city, state, zip, status, created_at,
           has_pets, has_stairs, heavy_lifting, duration_estimate, photo_url,
           address, student_id
    FROM jobs WHERE id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });

  // Determine if the requesting student has an accepted application
  let includeAddress = false;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
      const accepted = db.prepare(
        "SELECT id FROM applications WHERE job_id = ? AND student_id = ? AND status = 'accepted'"
      ).get(req.params.id, payload.userId);
      if (accepted) includeAddress = true;
    } catch (_) { /* invalid token — no address */ }
  }

  const { address, student_id, ...publicJob } = job;
  const responseJob = includeAddress ? { ...publicJob, address } : publicJob;
  return res.json({ job: responseJob });
});

// ── POST /api/jobs — multipart form, ID photo upload ────────
// Uses multer to handle file, then validates all text fields manually.
router.post('/', (req, res, next) => {
  uploadIdPhoto(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message });
    }

    const {
      poster_name, poster_email, poster_phone, poster_address, poster_dob,
      poster_id_type, poster_id_num, poster_agreed, poster_agreed_guidelines,
      title, description, category, pay, address, city, state, zip,
      duration_estimate, has_pets, has_stairs, heavy_lifting,
    } = req.body;

    const errors = [];

    // ── Full name ──────────────────────────────────────────
    const nameCheck = validateFullName(poster_name);
    if (!nameCheck.valid) errors.push(nameCheck.error);

    // ── Email format ───────────────────────────────────────
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!poster_email?.trim() || !emailRe.test(poster_email)) {
      errors.push('Valid email address is required.');
    }

    // ── Phone ──────────────────────────────────────────────
    const phoneCheck = validatePhone(poster_phone);
    if (!phoneCheck.valid) errors.push(phoneCheck.error);

    // ── Address ────────────────────────────────────────────
    if (!poster_address?.trim()) errors.push('Your home address is required.');

    // ── DOB ────────────────────────────────────────────────
    if (!poster_dob?.trim()) errors.push('Date of birth is required.');

    // ── ID type ────────────────────────────────────────────
    const validIdTypes = ["Driver's License", 'State ID', 'Passport'];
    if (!validIdTypes.includes(poster_id_type)) errors.push('Government ID type is required.');

    // ── ID number — format check by type and state ─────────
    if (validIdTypes.includes(poster_id_type)) {
      const idState = (poster_id_type === "Driver's License" || poster_id_type === 'State ID')
        ? (state || '').toUpperCase().trim()
        : null;
      const idCheck = validateIdNumber(poster_id_type, poster_id_num, idState);
      if (!idCheck.valid) errors.push(idCheck.error);
    }

    // ── ID photo ───────────────────────────────────────────
    if (!req.file) errors.push('A photo of your government ID is required.');

    // ── Agreements ─────────────────────────────────────────
    if (poster_agreed !== 'true') errors.push('You must agree to the terms of responsibility.');
    if (process.env.NODE_ENV === 'production') {
      if (!poster_agreed_guidelines || poster_agreed_guidelines === 'false') {
        errors.push('You must agree to the Community Guidelines.');
      }
    }

    // ── Task title ─────────────────────────────────────────
    if (!title?.trim() || title.trim().length < 5) errors.push('Title required (min 5 chars).');
    if (title?.trim().length > 100) errors.push('Title must be 100 characters or less.');

    // ── Description ────────────────────────────────────────
    if (!description?.trim() || description.trim().length < 20) {
      errors.push('Description is required and must be at least 20 characters.');
    }

    // ── Category ───────────────────────────────────────────
    if (!CATEGORIES.includes(category)) errors.push('Select a valid category.');

    // ── Pay ────────────────────────────────────────────────
    const payNum = parseFloat(pay);
    if (isNaN(payNum) || payNum < 5 || payNum > 2000) errors.push('Pay must be between $5 and $2,000.');

    // ── Task address ───────────────────────────────────────
    if (!address?.trim() || address.trim().length < 5) errors.push('Task street address is required.');

    // ── City ───────────────────────────────────────────────
    if (!city?.trim() || city.trim().length < 2) errors.push('City is required.');
    if (city && !/^[A-Za-z\s\-'.]+$/.test(city.trim())) errors.push('City name contains invalid characters.');

    // ── State ──────────────────────────────────────────────
    if (!state?.trim() || state.trim().length !== 2) errors.push('Two-letter state abbreviation is required (e.g. TX).');

    // ── ZIP + state cross-validation ───────────────────────
    if (/^\d{5}$/.test(zip) && state?.trim().length === 2) {
      const zipCheck = validateZipState(zip, state);
      if (!zipCheck.valid) errors.push(zipCheck.error);
    } else if (!/^\d{5}$/.test(zip)) {
      errors.push('ZIP code must be exactly 5 digits.');
    }

    // ── Prohibited keywords ────────────────────────────────
    if (title?.trim() || description?.trim()) {
      const combined = ((title || '') + ' ' + (description || '')).toLowerCase();
      const matched = PROHIBITED_KEYWORDS.find(kw => combined.includes(kw.toLowerCase()));
      if (matched) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          error: 'This job type is not permitted on Campus Hands. See our community guidelines.',
        });
      }
    }

    // Return first error if any basic validation failed
    if (errors.length) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: errors[0] });
    }

    // ── Age check: poster must be 18+ ──────────────────────
    if (!isPosterOldEnough(poster_dob)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        error: 'You must be 18 years of age or older to post a task on Campus Hands.',
      });
    }

    // ── Email domain MX check (async — runs after basic validation) ──
    try {
      const emailDomainCheck = await validateEmailDomain(poster_email.trim().toLowerCase());
      if (!emailDomainCheck.valid) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: emailDomainCheck.error });
      }
    } catch {
      // DNS lookup failure — allow through rather than block legitimate users
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO jobs (
        id, poster_name, poster_email, poster_phone, poster_address, poster_dob,
        poster_id_type, poster_id_num, poster_id_photo, poster_agreed,
        title, description, category, pay, address, city, state, zip,
        duration_estimate, has_pets, has_stairs, heavy_lifting
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      poster_name.trim(),
      poster_email.trim().toLowerCase(),
      phoneCheck.normalized
        ? `${phoneCheck.normalized.slice(0,3)}-${phoneCheck.normalized.slice(3,6)}-${phoneCheck.normalized.slice(6)}`
        : poster_phone.trim(),
      poster_address.trim(),
      poster_dob.trim(),
      poster_id_type,
      poster_id_num.trim().toUpperCase().replace(/[-\s]/g, ''),
      req.file.filename,
      title.trim(),
      description.trim(),
      category,
      payNum,
      address.trim(),
      city.trim(),
      state.trim().toUpperCase(),
      zip.trim(),
      duration_estimate?.trim() || null,
      has_pets === 'true' ? 1 : 0,
      has_stairs === 'true' ? 1 : 0,
      heavy_lifting === 'true' ? 1 : 0
    );

    return res.status(201).json({
      message: 'Task posted! Students will apply and contact you.',
      jobId: id,
    });
  });
});

// ── POST /api/jobs/:id/mark-complete ────────────────────────
// Now just sets status to pending_payment so payment can be taken.
// Called automatically after student is accepted — not a separate poster action.
router.post('/:id/mark-complete', [
  body('poster_email').isEmail().normalizeEmail().withMessage('Email required.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });
  if (job.poster_email !== req.body.poster_email) {
    return res.status(403).json({ error: 'Email does not match this task.' });
  }
  if (!['assigned', 'pending_payment'].includes(job.status)) {
    return res.status(400).json({ error: 'Task must be assigned before payment.' });
  }

  db.prepare("UPDATE jobs SET status = 'pending_payment' WHERE id = ?")
    .run(req.params.id);

  return res.json({ message: 'Ready for payment.' });
});

// ── POST /api/jobs/:id/release ───────────────────────────────
// Poster confirms work done: active → pending_review
// This is where the student actually gets paid via Stripe transfer.
router.post('/:id/release', [
  body('poster_email').isEmail().normalizeEmail().withMessage('Email required.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });
  if (job.poster_email !== req.body.poster_email) {
    return res.status(403).json({ error: 'Email does not match this task.' });
  }
  if (job.status !== 'active') {
    return res.status(400).json({ error: 'Task must be active before releasing payment.' });
  }

  // Get the paid transaction and student stripe account
  const tx = db.prepare(`
    SELECT t.*, u.stripe_account_id AS student_stripe_account
    FROM transactions t
    JOIN users u ON u.id = t.student_id
    WHERE t.job_id = ? AND t.status = 'paid'
  `).get(job.id);

  if (!tx) return res.status(400).json({ error: 'No confirmed payment found for this task.' });

  const payoutCents = Math.round(tx.student_payout * 100);

  // Transfer to student if they have a connected Stripe account
  let transferId = null;
  if (tx.student_stripe_account) {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured on this server.' });
    }
    try {
      const transfer = await stripe.transfers.create({
        amount:      payoutCents,
        currency:    'usd',
        destination: tx.student_stripe_account,
        description: `Campus Hands payout: "${job.title}"`,
        metadata:    { job_id: job.id, transaction_id: tx.id },
      });
      transferId = transfer.id;
    } catch (err) {
      console.error('Stripe transfer error:', err.message);
      return res.status(500).json({
        error: 'Could not transfer funds to student: ' + err.message,
      });
    }
  }
  // If student has no Stripe account, funds remain on the platform —
  // admin can manually disburse or student needs to set up payouts.

  db.prepare(`
    UPDATE transactions
    SET stripe_transfer_id = ?, payout_status = ?
    WHERE id = ?
  `).run(transferId, transferId ? 'transferred' : 'pending_account', tx.id);

  db.prepare("UPDATE jobs SET status = 'pending_review', completed_at = datetime('now') WHERE id = ?")
    .run(req.params.id);

  const msg = tx.student_stripe_account
    ? 'Payment released and sent to the student. Both parties can now leave a rating.'
    : 'Work marked complete. The student needs to set up a payout account to receive their earnings.';

  return res.json({ message: msg });
});

// ── POST /api/jobs/:id/rate ──────────────────────────────────
router.post('/:id/rate', [
  body('stars').isInt({ min: 1, max: 5 }).withMessage('Stars must be 1–5.'),
  body('comment').optional().trim().isLength({ max: 500 }),
  body('poster_email').optional().isEmail().normalizeEmail(),
  body('student_token').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });
  if (!['pending_review', 'completed'].includes(job.status)) {
    return res.status(400).json({ error: 'Task must be marked complete before rating.' });
  }
  if (!job.student_id) return res.status(400).json({ error: 'No student assigned to this task.' });

  const { stars, comment, poster_email, student_token } = req.body;
  let rated_by = null;

  if (poster_email) {
    if (job.poster_email !== poster_email) {
      return res.status(403).json({ error: 'Email does not match this task.' });
    }
    rated_by = 'poster';
  } else if (student_token) {
    try {
      const payload = jwt.verify(student_token, process.env.JWT_SECRET);
      if (payload.userId !== job.student_id) {
        return res.status(403).json({ error: 'You are not the assigned student for this task.' });
      }
      rated_by = 'student';
    } catch {
      return res.status(401).json({ error: 'Invalid student token.' });
    }
  } else {
    return res.status(400).json({ error: 'poster_email or student_token required.' });
  }

  const existing = db.prepare('SELECT id FROM ratings WHERE job_id = ? AND rated_by = ?')
    .get(req.params.id, rated_by);
  if (existing) return res.status(409).json({ error: 'You already rated this task.' });

  const ratingId = uuidv4();
  db.prepare('INSERT INTO ratings (id, job_id, student_id, rated_by, stars, comment) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ratingId, job.id, job.student_id, rated_by, parseInt(stars), comment || null);

  if (rated_by === 'poster') {
    const stats = db.prepare(`
      SELECT AVG(stars) AS avg, COUNT(*) AS cnt FROM ratings
      WHERE student_id = ? AND rated_by = 'poster'
    `).get(job.student_id);
    db.prepare('UPDATE users SET avg_rating = ?, rating_count = ? WHERE id = ?')
      .run(Math.round(stats.avg * 10) / 10, stats.cnt, job.student_id);
  }

  const ratingCount = db.prepare('SELECT COUNT(*) AS cnt FROM ratings WHERE job_id = ?').get(job.id).cnt;
  if (ratingCount >= 2) {
    db.prepare("UPDATE jobs SET status = 'completed' WHERE id = ?").run(job.id);
  }

  return res.json({ message: 'Rating submitted. Thank you!' });
});

// ── DELETE /api/jobs/:id ─────────────────────────────────────
router.delete('/:id', [
  body('poster_email').isEmail().normalizeEmail(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });
  if (job.poster_email !== req.body.poster_email) {
    return res.status(403).json({ error: 'Email does not match.' });
  }
  if (job.status === 'assigned') {
    return res.status(400).json({ error: 'Cannot cancel an assigned task.' });
  }

  db.prepare("UPDATE jobs SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  return res.json({ message: 'Task cancelled.' });
});

module.exports = router;
