// server/utils/upload.js — Multer config for ID photo uploads
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// On Render, set UPLOAD_DIR to your persistent disk mount path (e.g. /data/uploads).
// Locally falls back to <project-root>/uploads.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'ids')
  : path.join(__dirname, '..', '..', 'uploads', 'ids');

// Ensure the directory exists on first boot
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.pdf'];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP, HEIC) or PDF are accepted for ID uploads.'));
  }
}

const uploadIdPhoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
}).single('poster_id_photo');

module.exports = { uploadIdPhoto, UPLOAD_DIR };
