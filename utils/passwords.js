// Password rules and hashing, shared by the "Become an Agent" form and the
// password-reset flow.
//
// Passwords are NEVER stored. Only a bcrypt hash is — a one-way scramble that
// can't be turned back into the password, by the admin, by us, or by anyone
// who got a copy of the database. Login works by hashing what's typed and
// comparing the two hashes.

const bcrypt = require('bcryptjs');

const MIN_LENGTH = 8;
const MAX_BYTES = 72; // bcrypt only looks at the first 72 bytes

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.trim() === '') return { ok: false, error: 'Please choose a password.' };
  if (pw.length < MIN_LENGTH) return { ok: false, error: `Your password must be at least ${MIN_LENGTH} characters.` };
  if (Buffer.byteLength(pw, 'utf8') > MAX_BYTES) return { ok: false, error: 'That password is too long — please keep it under 72 characters.' };
  return { ok: true };
}

const hashPassword = (pw) => bcrypt.hash(pw, 10);

module.exports = { checkPassword, hashPassword, MIN_LENGTH };
