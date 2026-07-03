// server/db.js — SQLite database setup and schema
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────
// Users = students only. Anyone can post jobs without an account.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    email             TEXT UNIQUE NOT NULL,
    password          TEXT NOT NULL,
    verified          INTEGER NOT NULL DEFAULT 0,
    verify_token      TEXT,
    stripe_account_id TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    poster_name  TEXT NOT NULL,
    poster_email TEXT NOT NULL,
    poster_phone TEXT,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL,
    category     TEXT NOT NULL,
    pay          REAL NOT NULL,
    address      TEXT NOT NULL,
    city         TEXT NOT NULL,
    state        TEXT NOT NULL,
    zip          TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open'
                 CHECK(status IN ('open','assigned','completed','cancelled')),
    student_id   TEXT REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
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
`);

module.exports = db;
