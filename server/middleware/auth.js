// server/middleware/auth.js — JWT auth for student-only routes
const jwt = require('jsonwebtoken');
const db  = require('../db');

function requireAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
    if (!token && req.cookies?.token) token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);

    if (!user)          return res.status(401).json({ error: 'User not found.' });
    if (!user.verified) return res.status(403).json({ error: 'Please verify your email first.' });

    const { password, verify_token, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth };
