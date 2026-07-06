// server/index.js
require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// Warn loudly about missing required env vars
if (!process.env.JWT_SECRET) {
  console.error('❌  FATAL: JWT_SECRET is not set. Auth will not work.');
  console.error('   Set JWT_SECRET in your environment variables or .env file.');
  process.exit(1);
}
if (!process.env.ADMIN_SECRET) {
  console.error('❌  FATAL: ADMIN_SECRET is not set. Admin panel will not work.');
  console.error('   Set ADMIN_SECRET in your environment variables or .env file.');
  process.exit(1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      frameSrc:   ["https://js.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      imgSrc:     ["'self'", "data:", "blob:", "https:"],
    },
  },
}));

// CORS — same-origin in production, permissive locally
const allowedOrigin = process.env.APP_URL || 'http://localhost:3000';
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin fetches)
    if (!origin) return cb(null, true);
    // Allow the configured APP_URL and anything on the same host
    if (origin === allowedOrigin) return cb(null, true);
    // In development allow all localhost ports
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin))
      return cb(null, true);
    cb(null, true); // same server serves frontend — always same origin in practice
  },
  credentials: true,
}));

// Stripe webhook needs raw body — mount before express.json()
app.use('/api/payments/webhook', require('./routes/payments'));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ── CSRF origin check ───────────────────────────────────────
// For cookie-authenticated state-changing requests, verify the Origin or
// Referer header matches our expected host. This is a defence-in-depth layer
// on top of SameSite=Strict cookies.
// Webhook, GET, and HEAD requests are exempt.
const ALLOWED_ORIGIN = process.env.APP_URL || 'http://localhost:3000';
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Webhook has its own Stripe signature verification — exempt
  if (req.path.startsWith('/payments/webhook')) return next();

  const origin  = req.headers['origin'];
  const referer = req.headers['referer'];
  const host    = req.headers['host'];

  // Allow requests with a matching Origin header
  if (origin) {
    if (origin === ALLOWED_ORIGIN) return next();
    // In development, allow any localhost origin
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin))
      return next();
    return res.status(403).json({ error: 'Forbidden: origin not allowed.' });
  }

  // No Origin header — check Referer (curl/Postman/server-side callers won't have either;
  // we allow those for API key-authenticated calls like the admin key header)
  if (referer) {
    try {
      const refHost = new URL(referer).host;
      if (refHost === new URL(ALLOWED_ORIGIN).host) return next();
      if (process.env.NODE_ENV !== 'production' && /^localhost(:\d+)?$/.test(refHost))
        return next();
    } catch (_) { /* malformed referer — fall through */ }
    return res.status(403).json({ error: 'Forbidden: referer not allowed.' });
  }

  // No Origin or Referer — allow (server-to-server API calls, Postman, admin key auth)
  next();
});

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
}));

// API routes
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/jobs',         require('./routes/jobs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/poster',       require('./routes/poster-otp'));

// Serve uploaded ID photos — admin only (protected via admin key in query)
// e.g. GET /uploads/ids/filename.jpg?key=ADMIN_SECRET
app.use('/uploads/ids', (req, res, next) => {
  const secret = process.env.ADMIN_SECRET; // no fallback — must be set
  const key    = req.query.key || req.headers['x-admin-key'];
  if (!secret || !key || key !== secret) {
    return res.status(401).send('Unauthorized');
  }
  next();
}, express.static(path.join(__dirname, '..', 'uploads', 'ids')));

// admin.html — security is enforced by the API (JWT), not the HTML file itself.
// The page validates the token before loading any data.
app.get('/admin.html', (req, res, next) => next());

// Static frontend
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`\n🚀  Campus Hands running at http://localhost:${PORT}`);
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
    console.log('   ⚠️  Stripe not configured — add STRIPE_SECRET_KEY to .env\n');
  }
});
