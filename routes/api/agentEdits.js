const express = require('express');
const router = express.Router({ mergeParams: true }); // mounted at /api/agent/properties/:id/edits
const db = require('../../db/connection');
const { sendAdminNotification } = require('../../utils/email');
const { escapeHtml } = require('../../utils/agentEmails');
const { buildChanges, describeChanges, applyChanges } = require('../../utils/propertyEdits');

// The parent agent router already requires a logged-in agent. This also
// checks the property is THIS agent's own.
async function ownedProperty(req, res) {
  const row = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Not found.' }); return null; }
  if (row.agent_id !== req.user.agentId) { res.status(403).json({ error: 'Not your property.' }); return null; }
  return row;
}

// Send a change request.
router.post('/', async (req, res) => {
  const row = await ownedProperty(req, res);
  if (!row) return;
  if (row.approval_status === 'rejected') {
    return res.status(400).json({ error: 'This listing was rejected. Please contact the admin.' });
  }

  const result = buildChanges(req.body, row);
  if (!result.ok) return res.status(400).json({ error: result.error });

  // A listing that isn't public yet has nothing to protect — the admin sees
  // the final details when they approve the listing itself.
  if (row.approval_status !== 'approved') {
    await applyChanges(row.id, result.changes);
    return res.json({ applied: true, message: 'Saved. Your listing is still waiting for approval, so the admin will review these details then.' });
  }

  // Live listing: queue the request. A newer request replaces an older one.
  await db.prepare(`UPDATE property_edits SET status = 'replaced', decided_at = datetime('now') WHERE property_id = ? AND status = 'pending'`).run(row.id);
  const inserted = await db.prepare('INSERT INTO property_edits (property_id, agent_id, changes) VALUES (?,?,?)')
    .run(row.id, req.user.agentId, JSON.stringify(result.changes));

  const described = describeChanges(row, result.changes);
  res.status(201).json({
    applied: false,
    edit_id: inserted.lastInsertRowid,
    changes: described,
    message: 'Sent to the admin for approval. The public keeps seeing the current version until it is approved.',
  });

  // Tell the site owner (fire-and-forget; never delays the agent).
  sendAdminNotification(
    `Edit request — ${row.property_id}`,
    `<p><strong>${escapeHtml(req.user.name)}</strong> asked to change <strong>${escapeHtml(row.property_id)} — ${escapeHtml(row.title)}</strong>:</p>
     <ul>${described.map((c) => `<li><strong>${escapeHtml(c.label)}:</strong> ${escapeHtml(c.from)} &rarr; ${escapeHtml(c.to)}</li>`).join('')}</ul>
     <p>Review it under <strong>Pending Edits</strong> in the admin dashboard.</p>`
  );
});

// Withdraw the request that's still waiting.
router.delete('/pending', async (req, res) => {
  const row = await ownedProperty(req, res);
  if (!row) return;
  const result = await db.prepare(`UPDATE property_edits SET status = 'cancelled', decided_at = datetime('now') WHERE property_id = ? AND status = 'pending'`).run(row.id);
  res.json({ ok: true, cancelled: result.changes });
});

module.exports = router;
