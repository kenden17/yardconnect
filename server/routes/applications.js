// server/routes/applications.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendJobAssignedEmail } = require('../utils/email');
const { getAge } = require('../utils/ageCheck');

const router = express.Router();

// Categories that require the student to be 18+
const RESTRICTED_18_PLUS = [
  'Babysitting & Childcare',
  'Heavy Moving & Hauling',
  'Event Staffing',
  'Furniture Assembly',
];

// ── POST /api/applications — logged-in student applies ──────
router.post('/', requireAuth, [
  body('job_id').trim().notEmpty(),
  body('message').optional().trim().isLength({ max: 500 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { job_id, message } = req.body;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ? AND status = 'open'").get(job_id);
  if (!job) return res.status(404).json({ error: 'Task not found or no longer open.' });

  const existing = db.prepare(
    'SELECT id FROM applications WHERE job_id = ? AND student_id = ?'
  ).get(job_id, req.user.id);
  if (existing) return res.status(409).json({ error: 'You already applied to this task.' });

  // 18+ check for restricted categories (production only)
  if (process.env.NODE_ENV === 'production' && RESTRICTED_18_PLUS.includes(job.category)) {
    const student = db.prepare('SELECT dob FROM users WHERE id = ?').get(req.user.id);
    if (!student || getAge(student.dob) < 18) {
      return res.status(400).json({
        error: 'You must be 18 or older to apply for this type of job.',
      });
    }
  }

  const id = uuidv4();
  db.prepare('INSERT INTO applications (id, job_id, student_id, message) VALUES (?, ?, ?, ?)')
    .run(id, job_id, req.user.id, message || null);

  return res.status(201).json({ message: 'Application submitted! The poster will be in touch.' });
});

// ── GET /api/applications/job/:jobId — poster views applicants
// Secured by matching poster_email in query param (no account required)
router.get('/job/:jobId', (req, res) => {
  const { poster_email } = req.query;
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Task not found.' });

  if (!poster_email || job.poster_email !== poster_email.toLowerCase().trim()) {
    return res.status(403).json({ error: 'Email does not match this task.' });
  }

  const apps = db.prepare(`
    SELECT a.id, a.message, a.status, a.created_at,
           u.name AS student_name, u.email AS student_email
    FROM applications a
    JOIN users u ON u.id = a.student_id
    WHERE a.job_id = ?
    ORDER BY a.created_at ASC
  `).all(req.params.jobId);

  return res.json({ applications: apps, job });
});

// ── PATCH /api/applications/:id/accept ─────────────────────
router.patch('/:id/accept', [
  body('poster_email').isEmail().normalizeEmail(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const app = db.prepare(`
    SELECT a.*, j.poster_email, j.poster_name, j.status AS job_status, j.title AS job_title
    FROM applications a JOIN jobs j ON j.id = a.job_id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (app.poster_email !== req.body.poster_email) {
    return res.status(403).json({ error: 'Email does not match this task.' });
  }
  if (app.job_status !== 'open') return res.status(400).json({ error: 'Task is no longer open.' });
  if (app.status !== 'pending') return res.status(400).json({ error: 'Application already processed.' });

  // Get student info for email
  const student = db.prepare('SELECT name FROM users WHERE id = ?').get(app.student_id);

  db.prepare("UPDATE applications SET status = 'accepted' WHERE id = ?").run(app.id);
  db.prepare("UPDATE applications SET status = 'rejected' WHERE job_id = ? AND id != ?")
    .run(app.job_id, app.id);
  db.prepare("UPDATE jobs SET status = 'assigned', student_id = ? WHERE id = ?")
    .run(app.student_id, app.job_id);

  sendJobAssignedEmail(app.poster_email, app.poster_name, student.name, app.job_title)
    .catch(console.error);

  return res.json({ message: `${student.name} has been assigned. They'll reach out soon.` });
});

// ── PATCH /api/applications/:id/reject ─────────────────────
router.patch('/:id/reject', [
  body('poster_email').isEmail().normalizeEmail(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const app = db.prepare(`
    SELECT a.*, j.poster_email
    FROM applications a JOIN jobs j ON j.id = a.job_id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (app.poster_email !== req.body.poster_email) {
    return res.status(403).json({ error: 'Email does not match this task.' });
  }
  if (app.status !== 'pending') return res.status(400).json({ error: 'Application already processed.' });

  db.prepare("UPDATE applications SET status = 'rejected' WHERE id = ?").run(app.id);
  return res.json({ message: 'Application declined.' });
});

module.exports = router;
