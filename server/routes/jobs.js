// server/routes/jobs.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult, query } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendJobAssignedEmail } = require('../utils/email');

const router = express.Router();

// ── GET /api/jobs — public list of open jobs ────────────────
router.get('/', [
  query('category').optional().trim(),
  query('city').optional().trim(),
  query('zip').optional().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
], (req, res) => {
  const page  = req.query.page  || 1;
  const limit = 12;
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

  const jobs = db.prepare(`
    SELECT j.*, u.name AS homeowner_name
    FROM jobs j
    JOIN users u ON u.id = j.homeowner_id
    ${where}
    ORDER BY j.created_at DESC
    LIMIT ? OFFSET ?
  `).all([...params, limit, offset]);

  const total = db.prepare(`
    SELECT COUNT(*) AS cnt FROM jobs j ${where}
  `).get(params).cnt;

  return res.json({ jobs, total, page, pages: Math.ceil(total / limit) });
});

// ── GET /api/jobs/:id — single job ─────────────────────────
router.get('/:id', (req, res) => {
  const job = db.prepare(`
    SELECT j.*, u.name AS homeowner_name
    FROM jobs j JOIN users u ON u.id = j.homeowner_id
    WHERE j.id = ?
  `).get(req.params.id);

  if (!job) return res.status(404).json({ error: 'Job not found.' });
  return res.json({ job });
});

// ── POST /api/jobs — homeowner creates a job ───────────────
router.post('/', requireAuth, requireRole('homeowner'), [
  body('title').trim().notEmpty().isLength({ max: 100 }),
  body('description').trim().notEmpty().isLength({ max: 1000 }),
  body('category').trim().notEmpty(),
  body('pay').isFloat({ min: 5, max: 5000 }).withMessage('Pay must be between $5 and $5000.'),
  body('address').trim().notEmpty(),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty().isLength({ min: 2, max: 2 }),
  body('zip').trim().matches(/^\d{5}$/).withMessage('Valid 5-digit ZIP required.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { title, description, category, pay, address, city, state, zip } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO jobs (id, homeowner_id, title, description, category, pay, address, city, state, zip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, title, description, category, parseFloat(pay), address, city, state.toUpperCase(), zip);

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  return res.status(201).json({ job });
});

// ── PATCH /api/jobs/:id — homeowner edits their job ────────
router.patch('/:id', requireAuth, requireRole('homeowner'), [
  body('title').optional().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().notEmpty().isLength({ max: 1000 }),
  body('pay').optional().isFloat({ min: 5, max: 5000 }),
  body('status').optional().isIn(['open', 'cancelled']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.homeowner_id !== req.user.id) return res.status(403).json({ error: 'Not your job.' });
  if (!['open'].includes(job.status)) return res.status(400).json({ error: 'Cannot edit a job that is assigned or completed.' });

  const allowed = ['title', 'description', 'category', 'pay', 'address', 'city', 'state', 'zip', 'status'];
  const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
  if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update.' });

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values    = fields.map(f => req.body[f]);
  db.prepare(`UPDATE jobs SET ${setClause} WHERE id = ?`).run([...values, req.params.id]);

  return res.json({ job: db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id) });
});

// ── DELETE /api/jobs/:id — homeowner cancels/deletes job ───
router.delete('/:id', requireAuth, requireRole('homeowner'), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.homeowner_id !== req.user.id) return res.status(403).json({ error: 'Not your job.' });
  if (job.status === 'assigned') return res.status(400).json({ error: 'Cannot delete an assigned job. Cancel it first.' });

  db.prepare("UPDATE jobs SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  return res.json({ message: 'Job cancelled.' });
});

// ── GET /api/jobs/mine/homeowner — homeowner's own jobs ─────
router.get('/mine/homeowner', requireAuth, requireRole('homeowner'), (req, res) => {
  const jobs = db.prepare(`
    SELECT j.*,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'pending') AS app_count
    FROM jobs j
    WHERE j.homeowner_id = ?
    ORDER BY j.created_at DESC
  `).all(req.user.id);
  return res.json({ jobs });
});

// ── GET /api/jobs/mine/student — student's applied/assigned jobs
router.get('/mine/student', requireAuth, requireRole('student'), (req, res) => {
  const jobs = db.prepare(`
    SELECT j.*, u.name AS homeowner_name, a.status AS application_status, a.id AS application_id
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN users u ON u.id = j.homeowner_id
    WHERE a.student_id = ?
    ORDER BY a.created_at DESC
  `).all(req.user.id);
  return res.json({ jobs });
});

module.exports = router;
