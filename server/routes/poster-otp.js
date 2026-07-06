// server/routes/poster-otp.js — OTP request endpoint for poster actions
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { randomInt } = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { sendOtpEmail } = require('../utils/email');

const router = express.Router();

const VALID_ACTIONS = ['accept', 'reject', 'payment', 'release'];
const ACTION_LABELS = {
  accept:  'accept an applicant',
  reject:  'decline an applicant',
  payment: 'process payment',
  release: 'release payment',
};

// In-memory rate limiter: 3 OTP requests per IP+email per hour
const otpRateMap = new Map(); // `${ip}:${email}` -> [timestamps]

function checkOtpRate(ip, email) {
  const key   = `${ip}:${email}`;
  const now   = Date.now();
  const times = (otpRateMap.get(key) || []).filter(t => now - t < 60 * 60 * 1000);
  if (times.length >= 3) return false;
  times.push(now);
  otpRateMap.set(key, times);
  return true;
}

// ── POST /api/poster/request-otp ───────────────────────────
router.post('/request-otp', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('action').trim().notEmpty().withMessage('Action is required.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { email, action } = req.body;

  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'Invalid action.' });
  }

  // Rate limit check — keyed on IP + email to prevent both email enumeration and IP bypass
  if (!checkOtpRate(req.ip, email)) {
    return res.status(429).json({ error: 'Too many codes requested. Try again in an hour.' });
  }

  // Clean up expired OTPs on every request
  db.prepare("DELETE FROM poster_otps WHERE expires_at < datetime('now')").run();

  // Generate cryptographically secure 6-digit code
  const code      = randomInt(100000, 1000000).toString();
  const id        = uuidv4();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO poster_otps (id, email, code, action, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, await bcrypt.hash(code, 10), action, expiresAt);

  // Send email if SMTP is configured, otherwise log to console for dev
  if (process.env.SMTP_USER) {
    try {
      await sendOtpEmail(email, code, ACTION_LABELS[action]);
    } catch (err) {
      console.error('OTP email send error:', err.message);
      // Don't expose email errors to client — still return success
    }
  } else {
    console.log(`DEV OTP for ${email} [${action}]: ${code}`);
  }

  return res.json({ message: 'Code sent to your email.' });
});

module.exports = router;
