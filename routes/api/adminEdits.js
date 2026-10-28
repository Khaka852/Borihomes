const express = require('express');
const router = express.Router(); // mounted at /api/admin/property-edits (admin-only: the parent router checks the role)
const db = require('../../db/connection');
const { describeChanges, parseChanges, applyChanges } = require('../../utils/propertyEdits');
const { notifyEditDecision } = require('../../utils/agentEmails');

// Everything waiting for a decision, oldest first.
router.get('/', async (req, res) => {
  const rows = await db.prepare(`
    SELECT e.id AS edit_id, e.created_at AS submitted_at, e.changes AS proposed, u.name AS agent_name, p.*
    FROM property_edits e
    JOIN properties p ON p.id = e.property_id
    LEFT JOIN agents a ON a.id = e.agent_id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE e.status = 'pending'
    ORDER BY e.created_at ASC
  `).all();
  res.json({
    results: rows.map((r) => ({
      edit_id: r.edit_id,
      property_id: r.property_id,
      title: r.title,
      agent_name: r.agent_name || 'Unknown agent',
      submitted_at: r.submitted_at,
      changes: describeChanges(r, parseChanges(r.proposed)),
    })),
  });
});

router.put('/:id/approve', async (req, res) => {
  const edit = await db.prepare('SELECT * FROM property_edits WHERE id = ?').get(req.params.id);
  if (!edit) return res.status(404).json({ error: 'Not found.' });
  const property = await db.prepare('SELECT id FROM properties WHERE id = ?').get(edit.property_id);
  if (!property) return res.status(404).json({ error: 'That property no longer exists.' });

  // Claim it first, so two quick clicks can't apply (or email) it twice.
  const claim = await db.prepare(`UPDATE property_edits SET status = 'approved', decided_at = datetime('now') WHERE id = ? AND status = 'pending'`).run(edit.id);
  if (!claim.changes) return res.status(409).json({ error: 'This request has already been decided.' });

  try {
    await applyChanges(property.id, parseChanges(edit.changes));
  } catch (err) {
    await db.prepare(`UPDATE property_edits SET status = 'pending', decided_at = NULL WHERE id = ?`).run(edit.id);
    throw err;
  }
  res.json({ ok: true });
  notifyEditDecision(edit.id);
});

router.put('/:id/reject', async (req, res) => {
  const edit = await db.prepare('SELECT * FROM property_edits WHERE id = ?').get(req.params.id);
  if (!edit) return res.status(404).json({ error: 'Not found.' });
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  const claim = await db.prepare(`UPDATE property_edits SET status = 'rejected', admin_note = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'`)
    .run(note || null, edit.id);
  if (!claim.changes) return res.status(409).json({ error: 'This request has already been decided.' });
  res.json({ ok: true });
  notifyEditDecision(edit.id);
});

module.exports = router;
