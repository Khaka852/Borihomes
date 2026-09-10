const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../../db/connection');
const { requireApiRole } = require('../../middleware/auth');
const { toPrivateProperty } = require('../../utils/propertySerializer');
const { nextPropertyId } = require('../../utils/idGenerator');

router.use(requireApiRole('agent'));

function ownsProperty(req, propertyRowId) {
  const row = db.prepare('SELECT agent_id FROM properties WHERE id = ?').get(propertyRowId);
  return row && row.agent_id === req.user.agentId;
}

// List properties assigned to this agent (with private data — agent is authorised for their own listings)
router.get('/properties', (req, res) => {
  const rows = db.prepare('SELECT * FROM properties WHERE agent_id = ? ORDER BY created_at DESC').all(req.user.agentId);
  const results = rows.map((r) => {
    const images = db.prepare('SELECT * FROM property_images WHERE property_id = ? ORDER BY display_order').all(r.id)
      .map((i) => ({ url: i.image_url, type: i.image_type }));
    const priv = db.prepare('SELECT * FROM property_private WHERE property_id = ?').get(r.id);
    const landlord = r.landlord_id ? db.prepare('SELECT * FROM landlords WHERE id = ?').get(r.landlord_id) : null;
    return toPrivateProperty(r, images, priv, req.user.name, landlord);
  });
  res.json({ count: results.length, results });
});

// Add a new property (goes in as Pending Approval)
router.post(
  '/properties',
  [
    body('type').notEmpty(),
    body('title').trim().notEmpty(),
    body('price').isInt({ min: 1 }),
    body('location_area').trim().notEmpty(),
    body('bedrooms').isInt({ min: 0 }),
    body('bathrooms').isInt({ min: 0 }),
    body('description').trim().notEmpty(),
    body('full_address').trim().notEmpty().withMessage('Full address is required for internal records.'),
    body('landlord_name').trim().notEmpty(),
    body('landlord_phone').trim().notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      type, title, price, location_area, bedrooms, bathrooms, description, amenities,
      full_address, internal_notes, landlord_name, landlord_phone, landlord_email,
    } = req.body;

    const landlordResult = db
      .prepare('INSERT INTO landlords (name, phone, email, private_address) VALUES (?,?,?,?)')
      .run(landlord_name, landlord_phone, landlord_email || null, full_address);

    const propertyId = nextPropertyId();

    const propResult = db.prepare(`
      INSERT INTO properties (property_id, type, title, price, location_area, bedrooms, bathrooms, description, amenities, status, approval_status, agent_id, landlord_id)
      VALUES (?,?,?,?,?,?,?,?,?, 'Pending Approval', 'pending', ?, ?)
    `).run(
      propertyId, type, title, price, location_area, bedrooms, bathrooms, description,
      JSON.stringify(Array.isArray(amenities) ? amenities : (amenities ? [amenities] : [])),
      req.user.agentId, landlordResult.lastInsertRowid
    );

    db.prepare('INSERT INTO property_private (property_id, full_address, internal_notes) VALUES (?,?,?)')
      .run(propResult.lastInsertRowid, full_address, internal_notes || null);

    res.status(201).json({ property_id: propertyId, status: 'Pending Approval' });
  }
);

// Edit a property (only if owned by this agent)
router.put('/properties/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  if (row.agent_id !== req.user.agentId) return res.status(403).json({ error: 'Not your property.' });

  const fields = ['type', 'title', 'price', 'location_area', 'bedrooms', 'bathrooms', 'description'];
  const updates = [];
  const params = [];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  });
  if (req.body.amenities !== undefined) {
    updates.push('amenities = ?');
    params.push(JSON.stringify(req.body.amenities));
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });
  updates.push("updated_at = datetime('now')");
  params.push(row.id);
  db.prepare(`UPDATE properties SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  res.json({ ok: true });
});

// Manage availability status
router.put('/properties/:id/status', (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  if (row.agent_id !== req.user.agentId) return res.status(403).json({ error: 'Not your property.' });
  const { status } = req.body;
  if (!['Available', 'Reserved', 'Rented', 'Unavailable'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  db.prepare("UPDATE properties SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, row.id);
  res.json({ ok: true });
});

// Add image to owned property
router.post('/properties/:id/images', (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  if (row.agent_id !== req.user.agentId) return res.status(403).json({ error: 'Not your property.' });
  const { image_url, image_type } = req.body;
  if (!image_url || !image_type) return res.status(400).json({ error: 'image_url and image_type are required.' });
  const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM property_images WHERE property_id = ?').get(row.id).m || 0;
  db.prepare('INSERT INTO property_images (property_id, image_url, image_type, display_order) VALUES (?,?,?,?)')
    .run(row.id, image_url, image_type, maxOrder + 1);
  res.status(201).json({ ok: true });
});

// Enquiries for this agent's properties
router.get('/enquiries', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, p.property_id as prop_code, p.title FROM enquiries e
    JOIN properties p ON p.id = e.property_id
    WHERE e.assigned_agent_id = ?
    ORDER BY e.created_at DESC
  `).all(req.user.agentId);
  res.json({ results: rows });
});

router.put('/enquiries/:id/status', (req, res) => {
  const row = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(req.params.id);
  if (!row || row.assigned_agent_id !== req.user.agentId) return res.status(403).json({ error: 'Not authorised.' });
  const { status } = req.body;
  if (!['New', 'Contacted', 'Closed'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare('UPDATE enquiries SET status = ? WHERE id = ?').run(status, row.id);
  res.json({ ok: true });
});

// Inspections for this agent's properties
router.get('/inspections', (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, p.property_id as prop_code, p.title FROM inspections i
    JOIN properties p ON p.id = i.property_id
    WHERE i.agent_id = ?
    ORDER BY i.created_at DESC
  `).all(req.user.agentId);
  res.json({ results: rows });
});

router.put('/inspections/:id/status', (req, res) => {
  const row = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  if (!row || row.agent_id !== req.user.agentId) return res.status(403).json({ error: 'Not authorised.' });
  const { status } = req.body;
  if (!['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare('UPDATE inspections SET status = ? WHERE id = ?').run(status, row.id);
  res.json({ ok: true });
});

module.exports = router;
