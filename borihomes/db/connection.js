// Database connection — now backed by Turso (a hosted, libSQL-compatible
// SQLite database) instead of a local file. This is what makes real data
// (agents, properties, enquiries) survive every redeploy, since it no
// longer lives on Render's disposable filesystem.
//
// If TURSO_DATABASE_URL isn't set (e.g. running locally without a Turso
// account yet), this automatically falls back to a local file at
// db/borihomes.sqlite — so `npm start` still works out of the box for
// local development and testing.
const { createClient } = require('@libsql/client');
const path = require('path');

const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
const tursoToken = (process.env.TURSO_AUTH_TOKEN || '').trim();
const usingTurso = Boolean(tursoUrl);

let client;
try {
  client = createClient(
    usingTurso
      ? { url: tursoUrl, authToken: tursoToken }
      : { url: `file:${path.join(__dirname, 'borihomes.sqlite')}` }
  );
} catch (err) {
  // A malformed TURSO_DATABASE_URL (e.g. accidentally blank or corrupted in
  // the hosting platform's environment settings) would otherwise crash the
  // entire process immediately at startup, before any of the app's own
  // error handling ever runs. Fail loudly with a clear, specific message
  // instead of a cryptic library error.
  console.error('FATAL: could not set up the database connection.');
  console.error(usingTurso
    ? 'Check that TURSO_DATABASE_URL is set correctly (should start with libsql://) and TURSO_AUTH_TOKEN is present.'
    : 'Local file-based database setup failed unexpectedly.');
  console.error('Underlying error:', err.message);
  throw err;
}

if (!usingTurso) {
  console.log('No TURSO_DATABASE_URL set — using a local database file (fine for local development, NOT for production).');
}

// The libSQL client is promise-based (it talks to a database over the
// network), unlike the old synchronous library. This wrapper keeps the same
// db.prepare(sql).run/get/all(...) shape the rest of the app already uses —
// callers just need to `await` these now.

function normalizeArgs(args) {
  // Supports both call styles already used across the codebase:
  //   .run(a, b, c)              -> positional "?" placeholders
  //   .run({ name: 'x', ... })   -> named "@name" placeholders
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
    return args[0];
  }
  return args;
}

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

const db = {
  prepare(sql) {
    return {
      async run(...args) {
        const result = await client.execute({ sql, args: normalizeArgs(args) });
        return {
          lastInsertRowid: result.lastInsertRowid !== undefined && result.lastInsertRowid !== null
            ? Number(result.lastInsertRowid)
            : undefined,
          changes: result.rowsAffected,
        };
      },
      async get(...args) {
        const result = await client.execute({ sql, args: normalizeArgs(args) });
        if (!result.rows.length) return undefined;
        return rowToObject(result.rows[0], result.columns);
      },
      async all(...args) {
        const result = await client.execute({ sql, args: normalizeArgs(args) });
        return result.rows.map((r) => rowToObject(r, result.columns));
      },
    };
  },
  // For multi-statement SQL (schema creation, PRAGMA statements).
  async exec(sql) {
    await client.executeMultiple(sql);
  },
};

module.exports = db;
