const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../../db/connection');

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('phone').trim().isLength({ min: 7 }).withMessage('A valid phone number is required.'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email looks invalid.'),
    body('property_id').trim().notEmpty().withMessage('Property ID is required.'),
    body('message').trim().notEmpty().withMessage('Please include a short message.'),
    body('preferred_contact').optional().isIn(['phone', 'email', 'whatsapp']),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, email, property_id, message, preferred_contact } = req.body;

    const property = db
      .prepare(`SELECT * FROM properties WHERE property_id = ? AND approval_status = 'approved'`)
      .get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    const result = db
      .prepare(
        `INSERT INTO enquiries (property_id, customer_name, customer_phone, customer_email, message, preferred_contact, assigned_agent_id)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(property.id, name, phone, email || null, message, preferred_contact || 'phone', property.agent_id);

    res.status(201).json({
      enquiryNumber: result.lastInsertRowid,
      property: property.property_id,
      status: 'New',
      message: 'Your enquiry has been sent to the assigned agent.',
    });
  }
);

module.exports = router;
