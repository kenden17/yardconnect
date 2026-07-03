// server/routes/jobs.js — No auth required to post. Students apply.
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

  let where  = "WHERE j.status = 'open'";
  const params = [];

  if (req.query.category) {
    where += ' AND j.category = ?';
    params.push(req.query.category);
  }
  if (req.query.city) {
    where += ' AND LOWER(j.city) LIKE ?';
    params.push(`%${req.query.city.toLowerCase()}%`);
  }
  if (req.query.zip) {
    where += ' AND j.zip = ?';
    params.push(req.query.zip);
  }

  const jobs  = db.prepare(`
    SELECT id, poster_name, title, description, category, pay, city, state, zip, status, created_at
    FROM jobs j ${where}
    ORDER BY j.created_at DESC
    LIMIT ? OFFSET ?
  `).all([...params, limit, offset]);

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM jobs j ${where}`).get(params).cnt;

  return res.json({ jobs, total, page, pages: Math.ceil(total / limit) });
});

// ── GET /api/jobs/categories — return category list ─────────
router.get('/categories', (req, res) => res.json({ categories: CATEGORIES }));

// ── GET /api/jobs/:id ───────────────────────────────────────
router.get('/:id', (req, res) => {
  // Strip out poster contact info from public view
  const job = db.prepare(`
    SELECT id, poster_name, title, description, category, pay,
           address, city, state, zip, status, created_at
    FROM jobs WHERE id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ job });
});

// ── POST /api/jobs — NO AUTH, anyone can post ───────────────
router.post('/', [
  body('poster_name').trim().notEmpty().withMessage('Your name is required.'),
  body('poster_email').isEmail().normalizeEmail().withMessage('A valid email is required so students can contact you.'),
  body('poster_phone').optional().trim(),
  body('title').trim().notEmpty().isLength({ max: 100 }).withMessage('Title is required (max 100 chars).'),
  body('description').trim().notEmpty().isLength({ max: 1000 }).withMessage('Description is required.'),
  body('category').isIn(CATEGORIES).withMessage('Please select a valid category.'),
  body('pay').isFloat({ min: 5, max: 2000 }).withMessage('Pay must be between $5 and $2000.'),
  body('address').trim().notEmpty().withMessage('Address is required.'),
  body('city').trim().notEmpty().withMessage('City is required.'),
  body('state').trim().isLength({ min: 2, max: 2 }).withMessage('Two-letter state required.'),
  body('zip').trim().matches(/^\d{5}$/).withMessage('Valid 5-digit ZIP required.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { poster_name, poster_email, poster_phone, title, description,
          category, pay, address, city, state, zip } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO jobs
      (id, poster_name, poster_email, poster_phone, title, description, category, pay, address, city, state, zip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, poster_name, poster_email, poster_phone || null, title, description,
         category, parseFloat(pay), address, city, state.toUpperCase(), zip);

  return res.status(201).json({
    message: 'Task posted! Students will apply and contact you.',
    jobId: id,
  });
});

// ── DELETE /api/jobs/:id — cancel (no auth — uses poster_email as proof)
router.delete('/:id', [
  body('poster_email').isEmail().normalizeEmail(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found.' });
  if (job.poster_email !== req.body.poster_email) {
    return res.status(403).json({ error: 'Email does not match the one used to post this task.' });
  }
  if (job.status === 'assigned') {
    return res.status(400).json({ error: 'Cannot cancel an assigned task.' });
  }

  db.prepare("UPDATE jobs SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  return res.json({ message: 'Task cancelled.' });
});

// ── GET /api/jobs/mine/student — student's applications ─────
router.get('/mine/student', requireAuth, (req, res) => {
  const jobs = db.prepare(`
    SELECT j.id, j.poster_name, j.title, j.category, j.pay, j.city, j.state,
           j.status, j.created_at, a.status AS application_status, a.id AS application_id
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.student_id = ?
    ORDER BY a.created_at DESC
  `).all(req.user.id);
  return res.json({ jobs });
});

module.exports = router;
