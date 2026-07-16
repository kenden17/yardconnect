// server/db.js — SQLite database setup and schema
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    email             TEXT UNIQUE NOT NULL,
    password          TEXT NOT NULL,
    dob               TEXT NOT NULL DEFAULT '',
    verified          INTEGER NOT NULL DEFAULT 1,
    verify_token      TEXT,
    stripe_account_id TEXT,
    avg_rating        REAL DEFAULT 0,
    rating_count      INTEGER DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id               TEXT PRIMARY KEY,
    poster_name      TEXT NOT NULL,
    poster_email     TEXT NOT NULL,
    poster_phone     TEXT NOT NULL,
    poster_address   TEXT NOT NULL,
    poster_dob       TEXT NOT NULL,
    poster_id_type   TEXT NOT NULL,
    poster_id_num    TEXT NOT NULL,
    poster_id_photo  TEXT,
    poster_agreed    INTEGER NOT NULL DEFAULT 0,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL,
    category         TEXT NOT NULL,
    pay              REAL NOT NULL,
    address          TEXT NOT NULL,
    city             TEXT NOT NULL,
    state            TEXT NOT NULL,
    zip              TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'open'
                     CHECK(status IN ('open','assigned','pending_review','completed','cancelled')),
    student_id       TEXT REFERENCES users(id),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS applications (
    id         TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message    TEXT,
    status     TEXT NOT NULL DEFAULT 'pending'
               CHECK(status IN ('pending','accepted','rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(job_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id                    TEXT PRIMARY KEY,
    job_id                TEXT NOT NULL REFERENCES jobs(id),
    student_id            TEXT NOT NULL REFERENCES users(id),
    amount                REAL NOT NULL,
    platform_fee          REAL NOT NULL,
    student_payout        REAL NOT NULL,
    stripe_payment_intent TEXT,
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','paid','failed','refunded')),
    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id           TEXT PRIMARY KEY,
    job_id       TEXT NOT NULL REFERENCES jobs(id),
    student_id   TEXT NOT NULL REFERENCES users(id),
    rated_by     TEXT NOT NULL,
    stars        INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(job_id, rated_by)
  );

  CREATE TABLE IF NOT EXISTS poster_otps (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    code       TEXT NOT NULL,
    action     TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Schema migrations ───────────────────────────────────────────────────────
// Add columns via try/catch (SQLite has no IF NOT EXISTS for ALTER TABLE).
const alterStatements = [
  "ALTER TABLE jobs ADD COLUMN duration_estimate TEXT",
  "ALTER TABLE jobs ADD COLUMN has_pets INTEGER DEFAULT 0",
  "ALTER TABLE jobs ADD COLUMN has_stairs INTEGER DEFAULT 0",
  "ALTER TABLE jobs ADD COLUMN heavy_lifting INTEGER DEFAULT 0",
  "ALTER TABLE jobs ADD COLUMN photo_url TEXT",
  "ALTER TABLE jobs ADD COLUMN poster_agreed_guidelines INTEGER DEFAULT 0",
  "ALTER TABLE transactions ADD COLUMN stripe_transfer_id TEXT",
  "ALTER TABLE transactions ADD COLUMN payout_status TEXT NOT NULL DEFAULT 'pending'",
  "ALTER TABLE jobs ADD COLUMN flagged INTEGER DEFAULT 0",
  "ALTER TABLE jobs ADD COLUMN flag_reason TEXT",
  "ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0",
];

for (const stmt of alterStatements) {
  try { db.exec(stmt); } catch (_) { /* column already exists */ }
}

// ── Migrate jobs status CHECK constraint to include pending_payment + active ──
// SQLite can't alter a CHECK constraint, so we recreate the table.
// We detect whether the migration is needed by checking the existing constraint text.
(function migrateJobsStatusConstraint() {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'").get();
  if (!tableInfo || tableInfo.sql.includes("'pending_payment'")) return; // already migrated

  db.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE jobs_new (
      id               TEXT PRIMARY KEY,
      poster_name      TEXT NOT NULL,
      poster_email     TEXT NOT NULL,
      poster_phone     TEXT NOT NULL,
      poster_address   TEXT NOT NULL,
      poster_dob       TEXT NOT NULL,
      poster_id_type   TEXT NOT NULL,
      poster_id_num    TEXT NOT NULL,
      poster_id_photo  TEXT,
      poster_agreed    INTEGER NOT NULL DEFAULT 0,
      title            TEXT NOT NULL,
      description      TEXT NOT NULL,
      category         TEXT NOT NULL,
      pay              REAL NOT NULL,
      address          TEXT NOT NULL,
      city             TEXT NOT NULL,
      state            TEXT NOT NULL,
      zip              TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'open'
                       CHECK(status IN (
                         'open','assigned','pending_payment','active',
                         'pending_review','completed','cancelled'
                       )),
      student_id       TEXT REFERENCES users(id),
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at     TEXT,
      duration_estimate TEXT,
      has_pets         INTEGER DEFAULT 0,
      has_stairs       INTEGER DEFAULT 0,
      heavy_lifting    INTEGER DEFAULT 0,
      photo_url        TEXT
    );

    INSERT INTO jobs_new SELECT
      id, poster_name, poster_email, poster_phone, poster_address, poster_dob,
      poster_id_type, poster_id_num, poster_id_photo, poster_agreed,
      title, description, category, pay, address, city, state, zip,
      status, student_id, created_at, completed_at,
      duration_estimate, has_pets, has_stairs, heavy_lifting, photo_url
    FROM jobs;

    DROP TABLE jobs;
    ALTER TABLE jobs_new RENAME TO jobs;

    PRAGMA foreign_keys = ON;
  `);

  console.log('✅  Migrated jobs table: added pending_payment + active to status CHECK.');
})();

module.exports = db;
