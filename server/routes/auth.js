// server/routes/auth.js — Students only
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const db                    = require('../db');
const { isSchoolEmail }     = require('../utils/schoolEmail');
const { isStudentAgeValid } = require('../utils/ageCheck');

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
  body('dob').notEmpty().withMessage('Date of birth is required.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { name, email, dob, password } = req.body;

  // School email check
  if (!isSchoolEmail(email)) {
    return res.status(400).json({
      error: 'You must register with a school or k12 email address.',
    });
  }

  // Age check: must be 13–20
  if (!isStudentAgeValid(dob)) {
    return res.status(400).json({
      error: 'Students must be between 13 and 20 years old to join Campus Hands.',
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    db.prepare(`
      INSERT INTO users (id, name, email, dob, password, verified)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(userId, name, email, dob, hashedPassword);

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const { password: _pw, verify_token: _vt, ...safeUser } = user;
    return res.status(201).json({ token, user: safeUser });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────
router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid email or password.' });

  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

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
