const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router(); // mounted at /api/auth
const db = require('../../db/connection');
const { checkPassword, hashPassword } = require('../../utils/passwords');
const { agentEmailsStatus, sendPasswordResetEmail, siteUrl } = require('../../utils/agentEmails');

// "Forgot password" for AGENT accounts, by email link.
//  - The link's secret is random (256 bits); only its SHA-256 hash is stored.
//  - A link works once and expires after an hour.
//  - Asking never reveals whether an email has an account.
//  - The admin account is excluded: its password comes from the ADMIN_PASSWORD setting.

const RESET_MINUTES = 60;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const BAD_LINK = 'This reset link is invalid or has expired. Please request a new one.';

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a little while.' },
});

router.post('/forgot-password', limiter, async (req, res) => {
  // Reset emails go to agents' own addresses, which needs a verified sending domain.
  // Be honest instead of pretending an email was sent.
  if (!agentEmailsStatus().ok) return res.json({ unavailable: true });

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const user = await db.prepare("SELECT id, name, email FROM users WHERE email = ? AND role = 'agent'").get(email);
  res.json({ sent: true }); // same answer whether or not the account exists
  if (!user) return;

  try {
    // One email per 2 minutes per account, so nobody can flood someone's inbox.
    const recent = await db.prepare(`SELECT id FROM password_resets WHERE user_id = ? AND created_at > datetime('now','-2 minutes')`).get(user.id);
    if (recent) return;
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + RESET_MINUTES * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)').run(user.id, sha256(token), expires);
    await sendPasswordResetEmail(user.email, user.name, `${siteUrl()}/reset-password?token=${token}`);
  } catch (err) {
    console.error('forgot-password failed:', err.message);
  }
});

router.post('/reset-password', limiter, async (req, res) => {
  const { token, password } = req.body || {};
  const check = checkPassword(password);
  if (!check.ok) return res.status(400).json({ error: check.error });
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: BAD_LINK });

  const row = await db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(token));
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return res.status(400).json({ error: BAD_LINK });

  // Claim the link first, so two quick submits can't both succeed.
  const claim = await db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL`).run(row.id);
  if (!claim.changes) return res.status(400).json({ error: BAD_LINK });

  const hash = await hashPassword(password);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'agent'").run(hash, row.user_id);
  // Retire any other links still outstanding for this person.
  await db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`).run(row.user_id);
  res.json({ ok: true });
});

module.exports = router;
