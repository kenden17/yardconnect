const express = require('express');
const db      = require('../db');

const router = express.Router();

// ── Admin code — change this to whatever you want ────────────
const ADMIN_CODE = 'campushands2026';

// In-memory rate limiter: 10 login attempts per IP per 15 min
const loginAttempts = new Map();
function checkLoginLimit(ip) {
  const now   = Date.now();
  const reset = now + 15 * 60 * 1000;
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (now > v.resetAt) loginAttempts.delete(k);
    }
  }
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: reset });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

// General rate limiter for all admin API calls
const reqCounts = new Map();
function checkRateLimit(ip) {
  const now   = Date.now();
  const reset = now + 15 * 60 * 1000;
  if (reqCounts.size > 5000) {
    for (const [k, v] of reqCounts) {
      if (now > v.resetAt) reqCounts.delete(k);
    }
  }
  const entry = reqCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    reqCounts.set(ip, { count: 1, resetAt: reset });
    return false;
  }
  entry.count++;
  return entry.count > 120;
}

router.use((req, res, next) => {
  if (checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  next();
});

// POST /api/admin/login — verify code, returns session token
router.post('/login', (req, res) => {
  if (checkLoginLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Wait 15 minutes.' });
  }
  const { code } = req.body;
  if (!code || code !== ADMIN_CODE) {
    return res.status(401).json({ error: 'Invalid code.' });
  }
  // Return the code itself as the session token (simple — single admin user)
  return res.json({ token: ADMIN_CODE });
});

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-secret'];
  if (!key || key !== ADMIN_CODE) return res.status(401).json({ error: 'Unauthorized.' });
  next();
}

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const totalUsers     = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  const totalTasks     = db.prepare('SELECT COUNT(*) AS cnt FROM jobs').get().cnt;
  const openTasks      = db.prepare("SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'open'").get().cnt;
  const completedTasks = db.prepare("SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'completed'").get().cnt;
  const activeTasks    = db.prepare("SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'active'").get().cnt;
  const totalApps      = db.prepare('SELECT COUNT(*) AS cnt FROM applications').get().cnt;
  const totalRatings   = db.prepare('SELECT COUNT(*) AS cnt FROM ratings').get().cnt;
  const cashJobs       = db.prepare("SELECT COUNT(*) AS cnt FROM jobs WHERE payment_method = 'cash' AND status != 'cancelled'").get().cnt;
  const checkJobs      = db.prepare("SELECT COUNT(*) AS cnt FROM jobs WHERE payment_method = 'check' AND status != 'cancelled'").get().cnt;
  const totalPay       = db.prepare("SELECT COALESCE(SUM(pay),0) AS total FROM jobs WHERE status = 'completed'").get().total;
  return res.json({ totalUsers, totalTasks, openTasks, completedTasks, activeTasks, totalApps, totalRatings, cashJobs, checkJobs, totalPay });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, avg_rating, rating_count, created_at, suspended,
      (SELECT COUNT(*) FROM applications a WHERE a.student_id = users.id) AS app_count,
      (SELECT COUNT(*) FROM jobs j
       JOIN applications a2 ON a2.job_id = j.id AND a2.student_id = users.id
       WHERE j.status = 'completed') AS jobs_completed
    FROM users ORDER BY created_at DESC
  `).all();
  return res.json({ users });
});

// GET /api/admin/tasks
router.get('/tasks', requireAdmin, (req, res) => {
  const tasks = db.prepare(`
    SELECT id, poster_name, poster_email, poster_phone, poster_address,
           poster_dob, poster_id_type, poster_id_num, poster_id_photo,
           title, category, pay, payment_method, city, state, status, created_at,
           flagged, flag_reason,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id = jobs.id) AS app_count
    FROM jobs ORDER BY created_at DESC
  `).all();
  return res.json({ tasks });
});

// GET /api/admin/ratings
router.get('/ratings', requireAdmin, (req, res) => {
  const ratings = db.prepare(`
    SELECT r.*, u.name AS student_name, j.title AS job_title, j.poster_name
    FROM ratings r
    JOIN users u ON u.id = r.student_id
    JOIN jobs j ON j.id = r.job_id
    ORDER BY r.created_at DESC
  `).all();
  return res.json({ ratings });
});

// PATCH /api/admin/jobs/:id/flag
router.patch('/jobs/:id/flag', requireAdmin, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  const { reason } = req.body;
  db.prepare('UPDATE jobs SET flagged = 1, flag_reason = ? WHERE id = ?')
    .run(reason || null, req.params.id);
  return res.json({ message: 'Job flagged.' });
});

// PATCH /api/admin/jobs/:id/unflag
router.patch('/jobs/:id/unflag', requireAdmin, (req, res) => {
  db.prepare('UPDATE jobs SET flagged = 0, flag_reason = NULL WHERE id = ?').run(req.params.id);
  return res.json({ message: 'Job unflagged.' });
});

// PATCH /api/admin/users/:id/suspend
router.patch('/users/:id/suspend', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  db.prepare('UPDATE users SET suspended = 1 WHERE id = ?').run(req.params.id);
  return res.json({ message: 'User suspended.' });
});

// PATCH /api/admin/users/:id/unsuspend
router.patch('/users/:id/unsuspend', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  db.prepare('UPDATE users SET suspended = 0 WHERE id = ?').run(req.params.id);
  return res.json({ message: 'User unsuspended.' });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  return res.json({ message: 'User deleted.' });
});

// DELETE /api/admin/tasks/:id
router.delete('/tasks/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  return res.json({ message: 'Task deleted.' });
});

module.exports = router;
