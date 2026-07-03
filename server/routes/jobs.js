// server/routes/jobs.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult, query } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = [
  'Errands & Delivery',
  'Yard & Outdoor',
  'Cleaning & Tidying',
  'Moving & Hauling',
  'Pet Care',
  'Tech Help',
  'Tutoring & Academic',
  'Event Help',
  'Grocery & Shopping',
  'Snow & Ice',
  'Other',
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

  if (req.query.category) { where += ' AND j.category = ?';           params.push(req.query.category); }
  if (req.query.city)     { where += ' AND LOWER(j.city) LIKE ?';     params.push(`%${req.query.city.toLowerCase()}%`); }
  if (req.query.zip)      { where += ' AND j.zip = ?';                params.push(req.query.zip); }

  const jobs  = db.prepare(`
    SELECT id, poster_name, title, description, category, pay, city, state, zip, status, created_at
    FROM jobs j ${where}
    ORDER BY j.created_at DESC LIMIT ? OFFSET ?
  `).all([...params, limit, offset]);

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM jobs j ${where}`).get(params).cnt;
  return res.json({ jobs, total, page, pages: Math.ceil(total / limit) });
});

// ── GET /api/jobs/categories ────────────────────────────────
router.get('/categories', (req, res) => res.json({ categories: CATEGORIES }));

// ── GET /api/jobs/mine/student ──────────────────────────────
router.get('/mine/student', requireAuth, (req, res) => {
  const jobs = db.prepare(`
    SELECT j.id, j.poster_name, j.title, j.category, j.pay, j.city, j.state,
           j.status, j.created_at, a.status AS application_status, a.id AS application_id,
           (SELECT COUNT(*) FROM ratings r WHERE r.job_id = j.id AND r.rated_by = 'poster') AS poster_rated
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.student_id = ?
    ORDER BY a.created_at DESC
  `).all(req.user.id);
  return res.json({ jobs });
});

// ── GET /api/jobs/:id — public single job ───────────────────
router.get('/:id', (req, res) => {
  const job = db.prepare(`
    SELECT id, poster_name, title, description, category, pay,
           address, city, state, zip, status, created_at
    FROM jobs WHERE id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ job });
});

// ── POST /api/jobs — NO ACCOUNT REQUIRED ────────────────────
router.post('/', [
  body('poster_name').trim().notEmpty().withMessage('Full legal name is required.'),
  body('poster_email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('poster_phone').trim().notEmpty().withMessage('Phone number is required.'),
  body('poster_address').trim().notEmpty().withMessage('Your home address is required.'),
  body('poster_dob').trim().notEmpty().withMessage('Date of birth is required.'),
  body('poster_id_type').trim().isIn(["Driver's License","State ID","Passport","Other"])
    .withMessage('Government ID type is required.'),
  body('poster_id_num').trim().notEmpty().withMessage('Government ID number is required.'),
  body('poster_agreed').equals('true').withMessage('You must agree to the terms of responsibility.'),
  body('title').trim().notEmpty().isLength({ max: 100 }).withMessage('Title required (max 100 chars).'),
  body('description').trim().notEmpty().isLength({ max: 1000 }).withMessage('Description required.'),
  body('category').isIn(CATEGORIES).withMessage('Select a valid category.'),
  body('pay').isFloat({ min: 5, max: 2000 }).withMessage('Pay must be between $5 and $2000.'),
  body('address').trim().notEmpty().withMessage('Task address required.'),
  body('city').trim().notEmpty().withMessage('City required.'),
  body('state').trim().isLength({ min: 2, max: 2 }).withMessage('Two-letter state required.'),
  body('zip').trim().matches(/^\d{5}$/).withMessage('Valid 5-digit ZIP required.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const {
    poster_name, poster_email, poster_phone, poster_address, poster_dob,
    poster_id_type, poster_id_num, title, description, category, pay,
    address, city, state, zip,
  } = req.body;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO jobs (
      id, poster_name, poster_email, poster_phone, poster_address, poster_dob,
      poster_id_type, poster_id_num, poster_agreed,
      title, description, category, pay, address, city, state, zip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, poster_name, poster_email, poster_phone, poster_address, poster_dob,
    poster_id_type, poster_id_num,
    title, description, category, parseFloat(pay), address, city, state.toUpperCase(), zip
  );

  return res.status(201).json({
    message: 'Task posted! Students will apply and contact you.',
    jobId: id,
  });
});

// ── POST /api/jobs/:id/mark-complete — poster marks job done ─
// Moves status to 'pending_review' so student can rate the poster
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
  if (job.status !== 'assigned') {
    return res.status(400).json({ error: 'Task must be assigned before marking complete.' });
  }

  db.prepare("UPDATE jobs SET status = 'pending_review', completed_at = datetime('now') WHERE id = ?")
    .run(req.params.id);

  return res.json({ message: 'Task marked complete. Both parties can now leave a rating.' });
});

// ── POST /api/jobs/:id/rate — submit a rating ───────────────
router.post('/:id/rate', [
  body('stars').isInt({ min: 1, max: 5 }).withMessage('Stars must be 1–5.'),
  body('comment').optional().trim().isLength({ max: 500 }),
  // one of these two must be present
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

  // Poster rates student
  if (poster_email) {
    if (job.poster_email !== poster_email) {
      return res.status(403).json({ error: 'Email does not match this task.' });
    }
    rated_by = 'poster';
  }
  // Student rates poster (via JWT — attach requireAuth inline check)
  else if (student_token) {
    // Verify student is the assigned one
    try {
      const jwt     = require('jsonwebtoken');
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

  // Update student's average rating when poster rates
  if (rated_by === 'poster') {
    const stats = db.prepare(`
      SELECT AVG(stars) AS avg, COUNT(*) AS cnt FROM ratings
      WHERE student_id = ? AND rated_by = 'poster'
    `).get(job.student_id);
    db.prepare('UPDATE users SET avg_rating = ?, rating_count = ? WHERE id = ?')
      .run(Math.round(stats.avg * 10) / 10, stats.cnt, job.student_id);
  }

  // If both sides have rated, mark fully completed
  const ratingCount = db.prepare('SELECT COUNT(*) AS cnt FROM ratings WHERE job_id = ?').get(job.id).cnt;
  if (ratingCount >= 2) {
    db.prepare("UPDATE jobs SET status = 'completed' WHERE id = ?").run(job.id);
  }

  return res.json({ message: 'Rating submitted. Thank you!' });
});

// ── DELETE /api/jobs/:id — poster cancels ───────────────────
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
