// server/routes/payments.js
// Payments are handled offline (cash or check) — this route just
// exposes the student's completed job history for the earnings panel.
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/payments/history — student's completed job earnings
router.get('/history', requireAuth, (req, res) => {
  const jobs = db.prepare(`
    SELECT j.id, j.title, j.pay, j.payment_method, j.status,
           j.poster_name, j.completed_at, j.created_at,
           a.status AS application_status
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.student_id = ?
      AND a.status = 'accepted'
      AND j.status IN ('active', 'pending_review', 'completed')
    ORDER BY j.created_at DESC
  `).all(req.user.id);
  return res.json({ jobs });
});

module.exports = router;
