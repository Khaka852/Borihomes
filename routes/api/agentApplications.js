const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../../db/connection');
const { publicFormLimiter } = require('../../middleware/rateLimiters');
const { sendAdminNotification } = require('../../utils/email');

router.post(
  '/',
  publicFormLimiter,
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('phone').trim().isLength({ min: 7 }).withMessage('A valid phone number is required.'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email looks invalid.'),
    body('area_covered').optional({ checkFalsy: true }).trim(),
    body('experience').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { full_name, phone, email, area_covered, experience } = req.body;

    const result = await db
      .prepare(`INSERT INTO agent_applications (full_name, phone, email, area_covered, experience) VALUES (?,?,?,?,?)`)
      .run(full_name, phone, email || null, area_covered || null, experience || null);

    res.status(201).json({
      applicationId: result.lastInsertRowid,
      message: 'Thanks for your interest! Our team will review your application and reach out.',
    });

    // Fire-and-forget — doesn't delay the response to the applicant.
    sendAdminNotification(
      `New Agent Application — ${full_name}`,
      `<p><strong>${full_name}</strong> applied to become an agent.</p>
       <p>Phone: ${phone}${email ? `, Email: ${email}` : ''}</p>
       <p>Area(s) covered: ${area_covered || 'Not specified'}</p>
       <p>Experience: ${experience || 'Not specified'}</p>
       <p>Review it in the admin dashboard's Agent Applications page.</p>`
    );
  }
);

module.exports = router;
