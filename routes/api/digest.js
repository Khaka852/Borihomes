const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { sendWeeklyDigest } = require('../../utils/weeklyDigest');

// Called by an outside scheduler (once a week). Locked behind a secret token
// so nobody else can trigger it. If DIGEST_SECRET isn't set, this endpoint
// doesn't exist as far as the outside world is concerned.
router.post('/weekly-digest', async (req, res) => {
  const secret = process.env.DIGEST_SECRET;
  if (!secret) return res.status(404).json({ error: 'Not found.' });

  const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  res.json(await sendWeeklyDigest({ force: req.query.force === '1' }));
});

module.exports = router;
