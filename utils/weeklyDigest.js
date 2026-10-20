// Weekly email to every agent: how the platform did this week, plus their own
// numbers. By design it contains ONLY public listing facts (type, area, price)
// and counts — never customer names, phones, messages or landlord details —
// so agents stay motivated by seeing activity without being able to poach
// each other's customers.
//
// Triggered by POST /api/internal/weekly-digest (see routes/api/digest.js).
// Goes through the same switch as the other agent emails.

const db = require('../db/connection');
const { agentEmailsStatus, sendToAgent, escapeHtml: esc, emailShell, button, naira, siteUrl, firstName } = require('./agentEmails');

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
const PAUSE_BETWEEN_EMAILS_MS = 600; // Resend allows ~2 requests/second

const count = async (sql, ...args) => (await db.prepare(sql).get(...args)).c;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWeeklyDigest({ force = false } = {}) {
  const status = agentEmailsStatus();
  if (!status.ok) return { sent: 0, skipped: status.reason };

  // Guard against sending twice by accident (e.g. a scheduler firing twice).
  const last = await db.prepare(`SELECT value FROM app_meta WHERE key = 'last_digest_at'`).get();
  if (!force && last && Date.now() - Date.parse(last.value) < SIX_DAYS_MS) {
    return { sent: 0, skipped: 'a digest was already sent in the last 6 days (add ?force=1 to send anyway)' };
  }

  const since = `datetime('now','-7 days')`;
  const newListings = await db.prepare(`
    SELECT property_id, type, location_area, price FROM properties
    WHERE approval_status = 'approved' AND created_at >= ${since}
    ORDER BY created_at DESC
  `).all();
  const enquiryTotal = await count(`SELECT COUNT(*) c FROM enquiries WHERE created_at >= ${since}`);
  const inspectionTotal = await count(`SELECT COUNT(*) c FROM inspections WHERE created_at >= ${since}`);

  if (newListings.length === 0 && enquiryTotal === 0 && inspectionTotal === 0) {
    return { sent: 0, skipped: 'quiet week — nothing to report' };
  }

  const busiest = await db.prepare(`
    SELECT p.location_area AS area, COUNT(*) AS c
    FROM enquiries e JOIN properties p ON p.id = e.property_id
    WHERE e.created_at >= ${since}
    GROUP BY p.location_area ORDER BY c DESC LIMIT 3
  `).all();

  const agents = await db.prepare(`
    SELECT a.id, u.name, u.email FROM agents a JOIN users u ON u.id = a.user_id
    WHERE u.email IS NOT NULL AND u.email != ''
  `).all();

  const listingLines = newListings.slice(0, 5).map((l) =>
    `<li style="margin:4px 0;"><a href="${esc(siteUrl())}/properties/${encodeURIComponent(l.property_id)}" style="color:#12805f;">${esc(l.type)} · ${esc(l.location_area)} · ${naira(l.price)}/yr</a></li>`
  ).join('');

  let sent = 0;
  let failed = 0;
  for (const agent of agents) {
    const live = await count(`SELECT COUNT(*) c FROM properties WHERE agent_id = ? AND approval_status = 'approved'`, agent.id);
    const myEnquiries = await count(`SELECT COUNT(*) c FROM enquiries WHERE assigned_agent_id = ? AND created_at >= ${since}`, agent.id);
    const myInspections = await count(`SELECT COUNT(*) c FROM inspections WHERE agent_id = ? AND created_at >= ${since}`, agent.id);

    const yourWeek = live === 0
      ? `<p>You don't have a live listing yet — add one to start getting enquiries.</p>`
      : `<p><strong>Your week:</strong> ${live} live listing${live === 1 ? '' : 's'}, ${myEnquiries} enquir${myEnquiries === 1 ? 'y' : 'ies'}, ${myInspections} inspection request${myInspections === 1 ? '' : 's'}.</p>`;

    const html = emailShell('Your BoriHomes week', `
      <p>Hi ${esc(firstName(agent.name))},</p>
      <p><strong>Across BoriHomes this week:</strong> ${newListings.length} new listing${newListings.length === 1 ? '' : 's'}, ${enquiryTotal} enquir${enquiryTotal === 1 ? 'y' : 'ies'}, ${inspectionTotal} inspection request${inspectionTotal === 1 ? '' : 's'}.</p>
      ${yourWeek}
      ${listingLines ? `<p style="margin-bottom:4px;"><strong>New on the platform:</strong></p><ul style="margin:0 0 12px;padding-left:20px;">${listingLines}</ul>` : ''}
      ${busiest.length ? `<p><strong>Busiest areas:</strong> ${busiest.map((b) => esc(b.area)).join(', ')}</p>` : ''}
      ${button('List another property', `${siteUrl()}/agent/add-property`)}
      <p style="color:#667085;">More good listings means more enquiries for everyone.</p>`);

    const ok = await sendToAgent(agent.email, `BoriHomes this week: ${newListings.length} new listings, ${enquiryTotal} enquiries`, html);
    if (ok) sent++; else failed++;
    await pause(PAUSE_BETWEEN_EMAILS_MS);
  }

  if (sent > 0) {
    await db.prepare(`
      INSERT INTO app_meta (key, value) VALUES ('last_digest_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(new Date().toISOString());
  }
  return { sent, failed, agents: agents.length };
}

module.exports = { sendWeeklyDigest };
