// server/middleware/auth.js — JWT authentication middleware
const jwt = require('jsonwebtoken');
const db  = require('../db');

/**
 * Verifies the JWT from the Authorization header or cookie.
 * Attaches req.user on success.
 */
function requireAuth(req, res, next) {
  try {
    let token = null;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Fall back to httpOnly cookie
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    if (!user.verified) {
      return res.status(403).json({ error: 'Please verify your email before continuing.' });
    }

    // Attach user (without password) to request
    const { password, verify_token, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Restricts route to a specific role.
 * Must be used AFTER requireAuth.
 */
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Access restricted to ${role}s.` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
