const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../../db/connection');
const { publicFormLimiter } = require('../../middleware/rateLimiters');
const { sendAdminNotification } = require('../../utils/email');
const { escapeHtml } = require('../../utils/agentEmails');
const { checkPassword, hashPassword } = require('../../utils/passwords');

router.post(
  '/',
  publicFormLimiter,
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('phone').trim().isLength({ min: 7 }).withMessage('A valid phone number is required.'),
    body('email').trim().isEmail().withMessage('A valid email address is required.'),
    body('area_covered').optional({ checkFalsy: true }).trim(),
    body('experience').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    // Only send back the message and field name — never echo submitted values (the form includes a password).
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array().map((e) => ({ msg: e.msg, path: e.path })) });

    const passwordCheck = checkPassword(req.body.password);
    if (!passwordCheck.ok) return res.status(400).json({ error: passwordCheck.error });

    const { full_name, phone, email, area_covered, experience } = req.body;

    // The password itself is never saved — only its one-way hash.
    const passwordHash = await hashPassword(req.body.password);

    const result = await db
      .prepare(`INSERT INTO agent_applications (full_name, phone, email, area_covered, experience, password_hash) VALUES (?,?,?,?,?,?)`)
      .run(full_name, phone, email || null, area_covered || null, experience || null, passwordHash);

    res.status(201).json({
      applicationId: result.lastInsertRowid,
      message: 'Thanks for your interest! Our team will review your application. Once approved, you can log in with your email and the password you just chose.',
    });

    // Fire-and-forget — doesn't delay the response to the applicant.
    sendAdminNotification(
      `New Agent Application — ${full_name}`,
      `<p><strong>${escapeHtml(full_name)}</strong> applied to become an agent.</p>
       <p>Phone: ${escapeHtml(phone)}${email ? `, Email: ${escapeHtml(email)}` : ''}</p>
       <p>Area(s) covered: ${escapeHtml(area_covered || 'Not specified')}</p>
       <p>Experience: ${escapeHtml(experience || 'Not specified')}</p>
       <p>Review it in the admin dashboard's Agent Applications page.</p>`
    );
  }
);

module.exports = router;
