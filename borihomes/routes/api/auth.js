const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../../db/connection');
const { signToken } = require('../../middleware/auth');

// Blocks the crudest kind of attack — a script hammering /login thousands of
// times a minute to guess passwords. Deliberately loose for now (won't
// bother a real person even if they mistype their password many times) —
// tighten this later once things are settled, per your call.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  let agentId = null;
  if (user.role === 'agent') {
    const agent = await db.prepare('SELECT id FROM agents WHERE user_id = ?').get(user.id);
    agentId = agent ? agent.id : null;
  }

  const token = signToken({ id: user.id, role: user.role, name: user.name, agentId });
  res.cookie('bh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ role: user.role, name: user.name, redirect: user.role === 'admin' ? '/admin' : '/agent' });
});

router.post('/logout', (req, res) => {
  res.clearCookie('bh_token');
  res.json({ ok: true });
});

module.exports = router;
