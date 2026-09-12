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

    let whatsapp = null;
    if (property.agent_id) {
      const agent = db.prepare(`
        SELECT u.name, u.phone FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = ?
      `).get(property.agent_id);
      if (agent && agent.phone) {
        const waMessage = `Hi ${agent.name}, I'm ${name}. I'd like to inspect ${property.property_id} on ${preferred_date} at ${preferred_time}.`;
        whatsapp = { agentName: agent.name, link: buildWhatsAppLink(agent.phone, waMessage) };
      }
    }

    res.status(201).json({
      inspectionId: result.lastInsertRowid,
      property: property.property_id,
      status: 'Pending',
      message: 'Inspection request received. The agent will confirm your appointment.',
      whatsapp,
    });

    sendAdminNotification(
      `New Inspection Request — ${property.property_id}`,
      `<p><strong>${name}</strong> (${phone}) requested an inspection for <strong>${property.property_id} — ${property.title}</strong>.</p>
       <p>Preferred: ${preferred_date} at ${preferred_time}</p>
       ${message ? `<p>Note: ${message}</p>` : ''}
       <p>Assigned agent: ${whatsapp ? whatsapp.agentName : 'Unassigned'}</p>`
    );
  }
);

module.exports = router;
