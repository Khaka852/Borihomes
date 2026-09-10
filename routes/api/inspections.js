const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../../db/connection');

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('phone').trim().isLength({ min: 7 }).withMessage('A valid phone number is required.'),
    body('property_id').trim().notEmpty().withMessage('Property ID is required.'),
    body('preferred_date').trim().notEmpty().withMessage('Preferred date is required.'),
    body('preferred_time').trim().notEmpty().withMessage('Preferred time is required.'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, property_id, preferred_date, preferred_time, message } = req.body;

    const property = db
      .prepare(`SELECT * FROM properties WHERE property_id = ? AND approval_status = 'approved'`)
      .get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    const result = db
      .prepare(
        `INSERT INTO inspections (property_id, customer_name, customer_phone, agent_id, requested_date, requested_time, message)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(property.id, name, phone, property.agent_id, preferred_date, preferred_time, message || null);

    res.status(201).json({
      inspectionId: result.lastInsertRowid,
      property: property.property_id,
      status: 'Pending',
      message: 'Inspection request received. The agent will confirm your appointment.',
    });
  }
);

module.exports = router;
