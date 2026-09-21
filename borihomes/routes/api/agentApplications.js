const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../../db/connection');
const { publicFormLimiter } = require('../../middleware/rateLimiters');

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
  }
);

module.exports = router;
