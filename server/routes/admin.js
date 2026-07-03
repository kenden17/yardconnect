// server/routes/admin.js — Hidden admin panel API
const express = require('express');
const db = require('../db');
require('dotenv').config();

const router = express.Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'CVGhuH8E';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!key || key !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

// GET /api/admin/stats
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
  return res.json({ totalUsers, totalTasks, openTasks, completedTasks, totalApps, totalRatings, totalPaid });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, avg_rating, rating_count, created_at,
      (SELECT COUNT(*) FROM applications a WHERE a.student_id = users.id) AS app_count,
      (SELECT COUNT(*) FROM transactions t WHERE t.student_id = users.id AND t.status = 'paid') AS jobs_completed
    FROM users ORDER BY created_at DESC
  `).all();
  return res.json({ users });
});

// GET /api/admin/tasks
router.get('/tasks', requireAdmin, (req, res) => {
  const tasks = db.prepare(`
    SELECT id, poster_name, poster_email, poster_phone, poster_address,
           poster_dob, poster_id_type, poster_id_num,
           title, category, pay, city, state, status, created_at,
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
