// server/routes/auth.js — Students only. No homeowner accounts.
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const db                        = require('../db');
const { sendVerificationEmail } = require('../utils/email');
const { isSchoolEmail }         = require('../utils/schoolEmail');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── POST /api/auth/register ─────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { name, email, password } = req.body;

  // School email required
  if (!isSchoolEmail(email)) {
    return res.status(400).json({
      error: 'You must register with a school or k12 email address (e.g., you@students.isd.edu).',
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId         = uuidv4();
    const verifyToken    = uuidv4();

    db.prepare(`
      INSERT INTO users (id, name, email, password, verified, verify_token)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(userId, name, email, hashedPassword, verifyToken);

    // Send verification email — non-blocking
    sendVerificationEmail(email, name, verifyToken).catch(err => {
      console.error('Verification email failed:', err.message);
    });

    return res.status(201).json({
      message: 'Almost there! Check your email and click the verification link to activate your account.',
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── GET /api/auth/verify-email ──────────────────────────────
// This is the link students click in their email.
// On success: mark verified, issue a JWT, redirect to dashboard with token in URL param.
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.redirect('/register.html?error=missing_token');
  }

  const user = db.prepare('SELECT * FROM users WHERE verify_token = ?').get(token);
  if (!user) {
    return res.redirect('/register.html?error=invalid_token');
  }

  // Activate the account
  db.prepare('UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?').run(user.id);

  // Issue a JWT so they land logged in automatically
  const jwt_token = require('jsonwebtoken').sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Set cookie
  res.cookie('token', jwt_token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });

  // Redirect to dashboard, pass token + flag in URL for client-side storage
  return res.redirect(`/dashboard.html?verified=1&token=${encodeURIComponent(jwt_token)}`);
});

// ── POST /api/auth/login ────────────────────────────────────
router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  if (!user.verified) {
    return res.status(403).json({
      error: 'Please verify your email first. Check your inbox for the verification link.',
      unverified: true,
    });
  }

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });

  const { password: _pw, verify_token: _vt, ...safeUser } = user;
  return res.json({ token, user: safeUser });
});

// ── POST /api/auth/logout ───────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out.' });
});

// ── GET /api/auth/me ────────────────────────────────────────
router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
