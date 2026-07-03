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

app.use(cors({ origin: process.env.APP_URL || 'http://localhost:3000', credentials: true }));

// Stripe webhook needs raw body — mount before express.json()
app.use('/api/payments/webhook', require('./routes/payments'));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

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

// Serve uploaded ID photos — admin only (protected via admin key in query)
// e.g. GET /uploads/ids/filename.jpg?key=ADMIN_SECRET
app.use('/uploads/ids', (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  const key    = req.query.key || req.headers['x-admin-key'];
  if (!secret || !key || key !== secret) {
    return res.status(401).send('Unauthorized');
  }
  next();
}, express.static(path.join(__dirname, '..', 'uploads', 'ids')));

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
