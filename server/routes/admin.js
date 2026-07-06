// server/routes/admin.js — Admin API with JWT-based authentication
const express = require('express');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
require('dotenv').config();

const router = express.Router();

// FATAL: no hardcoded fallback — admin panel must not be accessible without a real secret
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error('❌  FATAL: ADMIN_SECRET is not set. Admin routes will be disabled.');
  // Routes below will still mount but requireAdmin will always reject — safe fail.
}

// ── Simple in-memory rate limiter (no new packages) ─────────────────────────
// Map: ip -> { count, resetAt }
const loginAttempts  = new Map(); // 5 per 15 min per IP  (login route)
const adminReqCounts = new Map(); // 100 per 15 min per IP (all admin routes)

const LOGIN_WINDOW  = 15 * 60 * 1000;
const LOGIN_LIMIT   = 5;
const ADMIN_WINDOW  = 15 * 60 * 1000;
const ADMIN_LIMIT   = 100;

function checkRateLimit(map, ip, limit, windowMs) {
  const now  = Date.now();
  const entry = map.get(ip);
  if (!entry || now > entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }
  entry.count++;
  if (entry.count > limit) return true; // limited
  return false;
}

// ── Rate limit ALL /api/admin/* routes ──────────────────────────────────────
router.use((req, res, next) => {
  const ip = req.ip;
  if (checkRateLimit(adminReqCounts, ip, ADMIN_LIMIT, ADMIN_WINDOW)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  next();
});

// ── requireAdmin middleware ──────────────────────────────────────────────────
// Accepts Authorization: Bearer <admin_jwt>  (primary)
// Also still accepts x-admin-key header for backward compat (ID photo endpoint)
function requireAdmin(req, res, next) {
  // Reject immediately if ADMIN_SECRET was never configured
  if (!ADMIN_SECRET) {
    return res.status(503).json({ error: 'Admin panel is not configured on this server.' });
  }

  // 1. Try JWT bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET + '_admin');
      if (payload.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      return next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
  }

  // 2. Backward compat: x-admin-key header (used by ID photo endpoint in index.js)
  const key = req.headers['x-admin-key'];
  if (key && key === ADMIN_SECRET) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized.' });
}

// ── POST /api/admin/login ────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  // Reject immediately if ADMIN_SECRET was never configured
  if (!ADMIN_SECRET) {
    return res.status(503).json({ error: 'Admin panel is not configured on this server.' });
  }

  const ip = req.ip;

  // Check login-specific rate limit (5 per 15 min) — return 429, not 401,
  // so the client knows it's rate-limited rather than thinking credentials are wrong.
  if (checkRateLimit(loginAttempts, ip, LOGIN_LIMIT, LOGIN_WINDOW)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const { secret } = req.body;
  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Success — issue signed JWT
  console.log('Admin login from IP:', ip);
  const token = jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET + '_admin',
    { expiresIn: '4h' }
  );

  return res.json({ token });
});

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', requireAdmin, (req, res) => {
  const totalUsers     = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  const totalTasks     = db.prepare('SELECT COUNT(*) AS cnt FROM jobs').get().cnt;
  const openTasks      = db.prepare("SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'open'").get().cnt;
  const completedTasks = db.prepare("SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'completed'").get().cnt;
  const totalApps      = db.prepare('SELECT COUNT(*) AS cnt FROM applications').get().cnt;
  const totalRatings   = db.prepare('SELECT COUNT(*) AS cnt FROM ratings').get().cnt;
  const totalPaid      = db.prepare(
    "SELECT COALESCE(SUM(student_payout),0) AS total FROM transactions WHERE status = 'paid'"
  ).get().total;
  const totalRevenue   = db.prepare(
    "SELECT COALESCE(SUM(platform_fee),0) AS total FROM transactions WHERE status='paid'"
  ).get().total;
  const pendingPayouts = db.prepare(
    "SELECT COUNT(DISTINCT t.student_id) AS cnt FROM transactions t JOIN users u ON u.id=t.student_id WHERE t.status='paid' AND (u.stripe_account_id IS NULL OR u.stripe_account_id='')"
  ).get().cnt;

  return res.json({ totalUsers, totalTasks, openTasks, completedTasks, totalApps, totalRatings, totalPaid, totalRevenue, pendingPayouts });
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, avg_rating, rating_count, created_at, suspended,
      (SELECT COUNT(*) FROM applications a WHERE a.student_id = users.id) AS app_count,
      (SELECT COUNT(*) FROM transactions t WHERE t.student_id = users.id AND t.status = 'paid') AS jobs_completed
    FROM users ORDER BY created_at DESC
  `).all();
  return res.json({ users });
});

// ── GET /api/admin/tasks ─────────────────────────────────────────────────────
router.get('/tasks', requireAdmin, (req, res) => {
  const tasks = db.prepare(`
    SELECT id, poster_name, poster_email, poster_phone, poster_address,
           poster_dob, poster_id_type, poster_id_num, poster_id_photo,
           title, category, pay, city, state, status, created_at,
           flagged, flag_reason,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id = jobs.id) AS app_count
    FROM jobs ORDER BY created_at DESC
  `).all();
  return res.json({ tasks });
});

// ── GET /api/admin/ratings ───────────────────────────────────────────────────
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

// ── GET /api/admin/transactions ──────────────────────────────────────────────
router.get('/transactions', requireAdmin, (req, res) => {
  const transactions = db.prepare(`
    SELECT t.*, j.title AS job_title, j.poster_name, j.poster_email,
           u.name AS student_name, u.email AS student_email,
           u.stripe_account_id AS student_stripe_account
    FROM transactions t
    JOIN jobs j ON j.id = t.job_id
    JOIN users u ON u.id = t.student_id
    ORDER BY t.created_at DESC
  `).all();
  return res.json({ transactions });
});

// ── GET /api/admin/pending-payouts ───────────────────────────────────────────
router.get('/pending-payouts', requireAdmin, (req, res) => {
  const payouts = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at,
           COUNT(t.id) AS pending_tx_count,
           SUM(t.student_payout) AS pending_amount
    FROM users u
    JOIN transactions t ON t.student_id = u.id
    WHERE t.status = 'paid'
    AND (u.stripe_account_id IS NULL OR u.stripe_account_id = '')
    GROUP BY u.id
    ORDER BY pending_amount DESC
  `).all();
  return res.json({ payouts });
});

// ── PATCH /api/admin/jobs/:id/flag ───────────────────────────────────────────
router.patch('/jobs/:id/flag', requireAdmin, (req, res) => {
  const { reason } = req.body;
  db.prepare('UPDATE jobs SET flagged = 1, flag_reason = ? WHERE id = ?')
    .run(reason || null, req.params.id);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  return res.json({ job });
});

// ── PATCH /api/admin/users/:id/suspend ──────────────────────────────────────
router.patch('/users/:id/suspend', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET suspended = 1 WHERE id = ?').run(req.params.id);
  const user = db.prepare('SELECT id, name, email, suspended, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
});

// ── PATCH /api/admin/users/:id/unsuspend ────────────────────────────────────
router.patch('/users/:id/unsuspend', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET suspended = 0 WHERE id = ?').run(req.params.id);
  const user = db.prepare('SELECT id, name, email, suspended, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
});

// ── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  return res.json({ message: 'User deleted.' });
});

// ── DELETE /api/admin/tasks/:id ─────────────────────────────────────────────
router.delete('/tasks/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  return res.json({ message: 'Task deleted.' });
});

module.exports = router;
