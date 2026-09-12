const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../../db/connection');
const { signToken } = require('../../middleware/auth');

// Blocks brute-force password guessing: after 8 failed/attempted logins from
// the same device/network in 15 minutes, further attempts are refused for a
// while. This applies per IP address, so it won't lock out other visitors.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  let agentId = null;
  if (user.role === 'agent') {
    const agent = db.prepare('SELECT id FROM agents WHERE user_id = ?').get(user.id);
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
