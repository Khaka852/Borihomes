const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../../db/connection');
const { publicFormLimiter } = require('../../middleware/rateLimiters');
const { buildWhatsAppLink } = require('../../utils/whatsapp');
const { sendAdminNotification } = require('../../utils/email');

router.post(
  '/',
  publicFormLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('phone').trim().isLength({ min: 7 }).withMessage('A valid phone number is required.'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email looks invalid.'),
    body('property_id').trim().notEmpty().withMessage('Property ID is required.'),
    body('message').trim().notEmpty().withMessage('Please include a short message.'),
    body('preferred_contact').optional().isIn(['phone', 'email', 'whatsapp']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, email, property_id, message, preferred_contact } = req.body;

    const property = await db
      .prepare(`SELECT * FROM properties WHERE property_id = ? AND approval_status = 'approved'`)
      .get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    const result = await db
      .prepare(
        `INSERT INTO enquiries (property_id, customer_name, customer_phone, customer_email, message, preferred_contact, assigned_agent_id)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(property.id, name, phone, email || null, message, preferred_contact || 'phone', property.agent_id);

    // Build a ready-to-send WhatsApp link so the customer can message the
    // assigned agent directly, with the property + their message pre-filled.
    let whatsapp = null;
    if (property.agent_id) {
      const agent = await db.prepare(`
        SELECT u.name, u.phone FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = ?
      `).get(property.agent_id);
      if (agent && agent.phone) {
        const waMessage = `Hi ${agent.name}, I'm ${name}. I'm interested in ${property.property_id} — ${message}`;
        whatsapp = { agentName: agent.name, link: buildWhatsAppLink(agent.phone, waMessage) };
      }
    }

    res.status(201).json({
      enquiryNumber: result.lastInsertRowid,
      property: property.property_id,
      status: 'New',
      message: 'Your enquiry has been sent to the assigned agent.',
      whatsapp,
    });

    // Fire-and-forget — doesn't delay the response to the customer.
    sendAdminNotification(
      `New Enquiry — ${property.property_id}`,
      `<p><strong>${name}</strong> (${phone}${email ? `, ${email}` : ''}) enquired about <strong>${property.property_id} — ${property.title}</strong>.</p>
       <p>Message: ${message}</p>
       <p>Assigned agent: ${whatsapp ? whatsapp.agentName : 'Unassigned'}</p>`
    );
  }
);

module.exports = router;
