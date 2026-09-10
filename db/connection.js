// Uses Node's built-in SQLite (node:sqlite) — no native compilation required.
// This avoids the "node-gyp / Visual Studio Build Tools" install headaches
// that separate npm database packages (like better-sqlite3) can trigger on
// some Windows machines.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'borihomes.sqlite');
const raw = new DatabaseSync(dbPath);
raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');

// Thin wrapper so the rest of the app can keep calling db.exec(...) and
// db.prepare(sql).run/get/all(...) exactly as before.
const db = {
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => raw.prepare(sql),
};

module.exports = db;
