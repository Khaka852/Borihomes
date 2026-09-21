const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../../db/connection');
const { requireApiRole } = require('../../middleware/auth');
const { toPrivateProperty } = require('../../utils/propertySerializer');
const { nextPropertyId } = require('../../utils/idGenerator');

router.use(requireApiRole('admin'));

async function fullPropertyView(r) {
  const imageRows = await db.prepare('SELECT * FROM property_images WHERE property_id = ? ORDER BY display_order').all(r.id);
  const images = imageRows.map((i) => ({ url: i.image_url, type: i.image_type }));
  const priv = await db.prepare('SELECT * FROM property_private WHERE property_id = ?').get(r.id);
  const landlord = r.landlord_id ? await db.prepare('SELECT * FROM landlords WHERE id = ?').get(r.landlord_id) : null;
  const agent = r.agent_id
    ? await db.prepare('SELECT u.name FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = ?').get(r.agent_id)
    : null;
  return toPrivateProperty(r, images, priv, agent ? agent.name : null, landlord);
}

// ---- Stats ----
router.get('/stats', async (req, res) => {
  const g = async (sql) => (await db.prepare(sql).get()).c;
  res.json({
    totalProperties: await g('SELECT COUNT(*) c FROM properties'),
    available: await g("SELECT COUNT(*) c FROM properties WHERE status='Available'"),
    rented: await g("SELECT COUNT(*) c FROM properties WHERE status='Rented'"),
    pendingApproval: await g("SELECT COUNT(*) c FROM properties WHERE approval_status='pending'"),
    totalAgents: await g('SELECT COUNT(*) c FROM agents'),
    totalLandlords: await g('SELECT COUNT(*) c FROM landlords'),
    totalEnquiries: await g('SELECT COUNT(*) c FROM enquiries'),
    pendingInspections: await g("SELECT COUNT(*) c FROM inspections WHERE status='Pending'"),
    newAgentApplications: await g("SELECT COUNT(*) c FROM agent_applications WHERE status='New'"),
  });
});

// ---- Properties ----
router.get('/properties', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM properties ORDER BY created_at DESC').all();
  const results = [];
  for (const r of rows) results.push(await fullPropertyView(r));
  res.json({ count: results.length, results });
});

router.post('/properties', async (req, res) => {
  const {
    type, title, price, location_area, bedrooms, bathrooms, description, amenities,
    full_address, internal_notes, landlord_id, agent_id,
  } = req.body;

  if (!type || !title || !price || !location_area) return res.status(400).json({ error: 'Missing required fields.' });

  const propertyId = await nextPropertyId();
  const result = await db.prepare(`
    INSERT INTO properties (property_id, type, title, price, location_area, bedrooms, bathrooms, description, amenities, status, approval_status, agent_id, landlord_id)
    VALUES (?,?,?,?,?,?,?,?,?, 'Available', 'approved', ?, ?)
  `).run(
    propertyId, type, title, price, location_area, bedrooms || 0, bathrooms || 0, description || '',
    JSON.stringify(amenities || []), agent_id || null, landlord_id || null
  );

  await db.prepare('INSERT INTO property_private (property_id, full_address, internal_notes) VALUES (?,?,?)')
    .run(result.lastInsertRowid, full_address || '', internal_notes || '');

  res.status(201).json({ property_id: propertyId });
});

router.put('/properties/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });

  const fields = ['type', 'title', 'price', 'location_area', 'bedrooms', 'bathrooms', 'description', 'agent_id', 'landlord_id'];
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
  if (updates.length) {
    updates.push("updated_at = datetime('now')");
    params.push(row.id);
    await db.prepare(`UPDATE properties SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (req.body.full_address !== undefined || req.body.internal_notes !== undefined) {
    await db.prepare(`
      INSERT INTO property_private (property_id, full_address, internal_notes)
      VALUES (?,?,?)
      ON CONFLICT(property_id) DO UPDATE SET
        full_address = excluded.full_address,
        internal_notes = excluded.internal_notes
    `).run(row.id, req.body.full_address || '', req.body.internal_notes || '');
  }

  res.json({ ok: true });
});

router.delete('/properties/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  await db.prepare('DELETE FROM properties WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

router.put('/properties/:id/approve', async (req, res) => {
  const row = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  await db.prepare("UPDATE properties SET approval_status='approved', status='Available' WHERE id = ?").run(row.id);
  res.json({ ok: true });
});

router.put('/properties/:id/reject', async (req, res) => {
  const row = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  await db.prepare("UPDATE properties SET approval_status='rejected', status='Unavailable' WHERE id = ?").run(row.id);
  res.json({ ok: true });
});

router.put('/properties/:id/status', async (req, res) => {
  const row = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  const { status } = req.body;
  if (!['Pending Approval', 'Available', 'Reserved', 'Rented', 'Unavailable'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  await db.prepare("UPDATE properties SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, row.id);
  res.json({ ok: true });
});

router.put('/properties/:id/assign', async (req, res) => {
  const row = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  const { agent_id } = req.body;
  await db.prepare('UPDATE properties SET agent_id = ? WHERE id = ?').run(agent_id, row.id);
  res.json({ ok: true });
});

// ---- Agents ----
router.get('/agents', async (req, res) => {
  const rows = await db.prepare(`
    SELECT a.id, u.name, u.email, u.phone, a.bio, a.created_at,
      (SELECT COUNT(*) FROM properties p WHERE p.agent_id = a.id) as propertyCount
    FROM agents a JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
  `).all();
  res.json({ results: rows });
});

router.post('/agents', async (req, res) => {
  const { name, email, phone, password, bio } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const userResult = await db.prepare('INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,\'agent\')')
      .run(name, email.trim().toLowerCase(), phone || '', hash);
    const agentResult = await db.prepare('INSERT INTO agents (user_id, bio) VALUES (?,?)').run(userResult.lastInsertRowid, bio || '');
    res.status(201).json({ id: agentResult.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Email already in use.' });
  }
});

router.delete('/agents/:id', async (req, res) => {
  const agent = await db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Not found.' });
  await db.prepare('UPDATE properties SET agent_id = NULL WHERE agent_id = ?').run(agent.id);
  await db.prepare('DELETE FROM users WHERE id = ?').run(agent.user_id); // cascades to agents row
  res.json({ ok: true });
});

// ---- Landlords ----
router.get('/landlords', async (req, res) => {
  const rows = await db.prepare(`
    SELECT l.*, (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as propertyCount
    FROM landlords l ORDER BY l.created_at DESC
  `).all();
  res.json({ results: rows });
});

router.post('/landlords', async (req, res) => {
  const { name, phone, email, private_address, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });
  const result = await db.prepare('INSERT INTO landlords (name, phone, email, private_address, notes) VALUES (?,?,?,?,?)')
    .run(name, phone, email || null, private_address || '', notes || '');
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/landlords/:id', async (req, res) => {
  const { name, phone, email, private_address, notes } = req.body;
  const result = await db.prepare('UPDATE landlords SET name=?, phone=?, email=?, private_address=?, notes=? WHERE id=?')
    .run(name, phone, email || null, private_address || '', notes || '', req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

router.delete('/landlords/:id', async (req, res) => {
  await db.prepare('UPDATE properties SET landlord_id = NULL WHERE landlord_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM landlords WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Agent Applications ("Become an Agent" form submissions) ----
router.get('/agent-applications', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM agent_applications ORDER BY created_at DESC').all();
  res.json({ results: rows });
});

router.put('/agent-applications/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['New', 'Contacted', 'Approved', 'Declined'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const result = await db.prepare('UPDATE agent_applications SET status = ? WHERE id = ?').run(status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

// ---- Users (read-only overview) ----
router.get('/users', async (req, res) => {
  const rows = await db.prepare('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ results: rows });
});

// ---- Enquiries / Inspections (all) ----
router.get('/enquiries', async (req, res) => {
  const rows = await db.prepare(`
    SELECT e.*, p.property_id as prop_code, p.title,
      (SELECT u.name FROM agents a JOIN users u ON u.id=a.user_id WHERE a.id = e.assigned_agent_id) as agent_name
    FROM enquiries e JOIN properties p ON p.id = e.property_id
    ORDER BY e.created_at DESC
  `).all();
  res.json({ results: rows });
});

router.get('/inspections', async (req, res) => {
  const rows = await db.prepare(`
    SELECT i.*, p.property_id as prop_code, p.title,
      (SELECT u.name FROM agents a JOIN users u ON u.id=a.user_id WHERE a.id = i.agent_id) as agent_name
    FROM inspections i JOIN properties p ON p.id = i.property_id
    ORDER BY i.created_at DESC
  `).all();
  res.json({ results: rows });
});

module.exports = router;
