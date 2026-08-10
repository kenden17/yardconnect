require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');
const rateLimit    = require('express-rate-limit');
const morgan       = require('morgan');

require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set.');
  process.exit(1);
}
if (!process.env.ADMIN_SECRET) {
  console.error('FATAL: ADMIN_SECRET is not set.');
  process.exit(1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:", "https:"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

const allowedOrigin = process.env.APP_URL || 'http://localhost:3000';
app.use(cors({
  origin: (origin, cb) => {
    // No origin = same-origin request or curl — always allow
    if (!origin) return cb(null, true);
    // Always allow the configured APP_URL
    if (origin === allowedOrigin) return cb(null, true);
    // In development allow any localhost origin regardless of port
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    return cb(null, false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Request logging — 'dev' format in development, 'combined' (Apache-style) in production
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
}));

// Block search engines from indexing admin and poster-management pages
app.use(['/admin.html', '/manage.html'], (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// API routes
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/jobs',         require('./routes/jobs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/poster',       require('./routes/poster-otp'));

// Proxy admin ID photo requests — verifies admin secret before serving the file
app.get('/api/admin/id-photo/:filename', (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  const key    = req.headers['x-admin-secret'];
  if (!secret || !key || key !== secret) return res.status(401).send('Unauthorized');

  const safeName = path.basename(req.params.filename);
  const filePath = path.join(__dirname, '..', 'uploads', 'ids', safeName);
  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Not found');
  });
});

// Static frontend
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC));

// Health check — used by hosting platforms for uptime monitoring
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.get('*', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`Campus Hands running at http://localhost:${PORT}`);
});
