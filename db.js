const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'wao-bank.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    country       TEXT,
    city          TEXT,
    phone         TEXT,
    iban          TEXT NOT NULL UNIQUE,
    balance       REAL NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    last_login    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    amount     REAL NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('in','out')),
    date       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
`);

module.exports = db;
