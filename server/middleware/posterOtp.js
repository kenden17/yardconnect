// server/middleware/posterOtp.js — OTP verification middleware for poster actions
const bcrypt = require('bcryptjs');
const db = require('../db');

/**
 * requirePosterOtp(action)
 * Returns an Express middleware that verifies a poster OTP before allowing the request.
 *
 * Expects req.body to include:
 *   - poster_email: the poster's email address
 *   - otp_code:     the 6-digit code sent to that email
 *
 * OTP codes are stored as bcrypt hashes — we retrieve all valid (unused, unexpired)
 * candidates for this email+action and compare with bcrypt.compare.
 *
 * On success: marks the OTP as used and calls next().
 * On failure: returns 400 or 401 JSON error.
 */
function requirePosterOtp(action) {
  return async (req, res, next) => {
    const { poster_email, otp_code } = req.body;

    if (!otp_code || !otp_code.toString().trim()) {
      return res.status(400).json({ error: 'Verification code required.' });
    }

    if (!poster_email) {
      return res.status(400).json({ error: 'poster_email is required.' });
    }

    const email = poster_email.toString().toLowerCase().trim();
    const code  = otp_code.toString().trim();

    // Fetch all valid (unused, unexpired) OTPs for this email+action.
    // We bcrypt-compare locally because the stored value is a hash.
    const candidates = db.prepare(`
      SELECT id, code FROM poster_otps
      WHERE email = ?
        AND action = ?
        AND used = 0
        AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 5
    `).all(email, action);

    let matchedId = null;
    for (const row of candidates) {
      const ok = await bcrypt.compare(code, row.code);
      if (ok) { matchedId = row.id; break; }
    }

    if (!matchedId) {
      return res.status(401).json({ error: 'Invalid or expired verification code.' });
    }

    // Mark OTP as used
    db.prepare('UPDATE poster_otps SET used = 1 WHERE id = ?').run(matchedId);

    next();
  };
}

module.exports = { requirePosterOtp };
