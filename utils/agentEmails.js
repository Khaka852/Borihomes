// Emails to AGENTS (utils/email.js, by contrast, emails the site owner).
//
// PRIVACY RULE, enforced here: customer details (name, phone, email, message)
// are sent ONLY to the single agent the property is assigned to — never to
// any other agent. Other agents only ever see aggregate numbers
// (see utils/weeklyDigest.js).
//
// SWITCHED OFF until you turn it on. Resend only lets an unverified account
// email its own owner, so nothing is sent to agents until ALL of these are true:
//   AGENT_EMAILS_ENABLED=true
//   RESEND_API_KEY is set
//   RESEND_FROM_ADDRESS is an address on your verified domain
// Every notify function is fire-and-forget and never throws, so an email
// problem can never break an enquiry, an inspection request or an approval.

const db = require('../db/connection');
const { buildWhatsAppLink } = require('./whatsapp');
const { describeProposed, parseChanges } = require('./propertyEdits');

const TEST_SENDER = 'onboarding@resend.dev';
let lastSkipReason = null;

function config() {
  return {
    enabled: process.env.AGENT_EMAILS_ENABLED === 'true',
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM_ADDRESS || `BoriHomes <${TEST_SENDER}>`,
  };
}

function agentEmailsStatus() {
  const c = config();
  if (!c.enabled) return { ok: false, reason: 'agent emails are switched off (AGENT_EMAILS_ENABLED is not "true")' };
  if (!c.apiKey) return { ok: false, reason: 'RESEND_API_KEY is not set' };
  if (c.from.includes(TEST_SENDER)) return { ok: false, reason: 'RESEND_FROM_ADDRESS is still the Resend test sender — verify your domain first' };
  return { ok: true };
}

function siteUrl() {
  return (process.env.SITE_URL || 'https://borihomes.onrender.com').replace(/\/$/, '');
}

// Customer-typed text goes into these emails, so it must be escaped —
// otherwise someone could slip links or markup into an email that looks
// like it came from BoriHomes.
function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const esc = escapeHtml;

function naira(n) { return '₦' + Number(n).toLocaleString('en-NG'); }
function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }

function button(label, href, color = '#12805f') {
  return `<p style="margin:14px 0;"><a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">${esc(label)}</a></p>`;
}

// `heading` and `innerHtml` must already be safe HTML (escape dynamic parts with esc()).
function emailShell(heading, innerHtml) {
  return `<div style="background:#f2f4f7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e7ec;">
    <div style="background:#12805f;color:#ffffff;padding:16px 22px;font-size:18px;font-weight:bold;">BoriHomes</div>
    <div style="padding:22px;color:#101826;font-size:15px;line-height:1.55;">
      <h2 style="margin:0 0 12px;font-size:18px;">${heading}</h2>
      ${innerHtml}
    </div>
    <div style="padding:14px 22px;background:#f9fafb;color:#667085;font-size:12px;">You're receiving this because you're a BoriHomes agent. Customer details in BoriHomes emails are for you only — please don't share them.</div>
  </div>
</div>`;
}

async function sendToAgent(to, subject, html) {
  const status = agentEmailsStatus();
  if (!status.ok) {
    if (lastSkipReason !== status.reason) {
      lastSkipReason = status.reason;
      console.log(`Agent emails skipped: ${status.reason}.`);
    }
    return false;
  }
  const c = config();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.from, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error('Resend agent email failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error sending agent email:', err.message);
    return false;
  }
}

async function getAgentContact(agentId) {
  if (!agentId) return null;
  const agent = await db.prepare(`
    SELECT u.name, u.email FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = ?
  `).get(agentId);
  return agent && agent.email ? agent : null;
}

function propertySummary(p) {
  return `<p style="margin:0 0 12px;"><strong>${esc(p.property_id)} — ${esc(p.title)}</strong><br>${esc(p.type)} · ${esc(p.location_area)} · ${naira(p.price)}/year</p>`;
}

function quote(text) {
  return `<div style="border-left:4px solid #12805f;background:#f2f4f7;padding:10px 14px;margin:10px 0;">${esc(text).replace(/\n/g, '<br>')}</div>`;
}

// ---------------------------------------------------------------------------
// Listing approved -> tell the agent who submitted it (only them).
async function notifyListingApproved(propertyId) {
  try {
    const p = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
    if (!p) return;
    const agent = await getAgentContact(p.agent_id);
    if (!agent) return;
    const stars = Number(p.rating) > 0 ? ` · ★ ${esc(p.rating)}` : '';
    const html = emailShell(`Your listing ${esc(p.property_id)} is live`, `
      <p>Hi ${esc(firstName(agent.name))}, your listing has been approved and renters can now see it.</p>
      <p style="margin:0 0 12px;"><strong>${esc(p.title)}</strong><br>${esc(p.type)} · ${esc(p.location_area)} · ${naira(p.price)}/year${stars}</p>
      ${button('View your live listing', `${siteUrl()}/properties/${encodeURIComponent(p.property_id)}`)}
      <p style="color:#667085;">Sharing the link on your WhatsApp status is a quick way to get more people looking at it.</p>`);
    await sendToAgent(agent.email, `Your listing ${p.property_id} is live`, html);
  } catch (err) {
    console.error('notifyListingApproved failed:', err.message);
  }
}

const CONTACT_LABELS = { phone: 'Phone call', whatsapp: 'WhatsApp', email: 'Email' };

// New enquiry -> only the agent assigned to that property.
async function notifyNewEnquiry(propertyId, c) {
  try {
    const p = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
    if (!p) return;
    const agent = await getAgentContact(p.agent_id);
    if (!agent) return;
    const waLink = buildWhatsAppLink(
      c.phone,
      `Hi ${c.name}, this is ${agent.name} from BoriHomes. Thanks for your interest in ${p.property_id} — how can I help?`
    );
    const html = emailShell(`New enquiry on your property ${esc(p.property_id)}`, `
      <p>Hi ${esc(firstName(agent.name))}, someone is interested in your listing:</p>
      ${propertySummary(p)}
      <p style="margin:0;"><strong>Name:</strong> ${esc(c.name)}<br>
      <strong>Phone:</strong> ${esc(c.phone)}${c.email ? `<br><strong>Email:</strong> ${esc(c.email)}` : ''}<br>
      <strong>Prefers:</strong> ${esc(CONTACT_LABELS[c.preferredContact] || 'Phone call')}</p>
      ${quote(c.message)}
      ${waLink ? button(`Chat with ${firstName(c.name)} on WhatsApp`, waLink, '#25D366') : ''}
      ${button('Open your enquiries', `${siteUrl()}/agent/enquiries`, '#344054')}
      <p style="color:#667085;">Quick replies win tenants — and this lead is yours alone.</p>`);
    await sendToAgent(agent.email, `New enquiry on your property ${p.property_id}`, html);
  } catch (err) {
    console.error('notifyNewEnquiry failed:', err.message);
  }
}

// New inspection request -> only the agent assigned to that property.
async function notifyNewInspection(propertyId, c) {
  try {
    const p = await db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
    if (!p) return;
    const agent = await getAgentContact(p.agent_id);
    if (!agent) return;
    const waLink = buildWhatsAppLink(
      c.phone,
      `Hi ${c.name}, this is ${agent.name} from BoriHomes. I'm confirming your inspection of ${p.property_id} on ${c.preferredDate} at ${c.preferredTime}.`
    );
    const html = emailShell(`Inspection requested for ${esc(p.property_id)}`, `
      <p>Hi ${esc(firstName(agent.name))}, a renter wants to see your property:</p>
      ${propertySummary(p)}
      <p style="margin:0;"><strong>When:</strong> ${esc(c.preferredDate)} at ${esc(c.preferredTime)}<br>
      <strong>Name:</strong> ${esc(c.name)}<br>
      <strong>Phone:</strong> ${esc(c.phone)}</p>
      ${c.message ? quote(c.message) : ''}
      ${waLink ? button(`Confirm with ${firstName(c.name)} on WhatsApp`, waLink, '#25D366') : ''}
      ${button('Open your inspections', `${siteUrl()}/agent/inspections`, '#344054')}
      <p style="color:#667085;">Confirm the time with them, then mark it Confirmed in your dashboard.</p>`);
    await sendToAgent(agent.email, `Inspection requested for ${p.property_id}`, html);
  } catch (err) {
    console.error('notifyNewInspection failed:', err.message);
  }
}

// The admin decided on a change request -> tell the agent who sent it (only them).
async function notifyEditDecision(editId) {
  try {
    const e = await db.prepare('SELECT * FROM property_edits WHERE id = ?').get(editId);
    if (!e || (e.status !== 'approved' && e.status !== 'rejected')) return;
    const p = await db.prepare('SELECT * FROM properties WHERE id = ?').get(e.property_id);
    const agent = await getAgentContact(e.agent_id);
    if (!p || !agent) return;
    const lines = describeProposed(parseChanges(e.changes))
      .map((c) => `<li><strong>${esc(c.label)}:</strong> ${esc(c.to)}</li>`).join('');
    const approved = e.status === 'approved';
    const html = emailShell(
      approved ? `Your change to ${esc(p.property_id)} is approved` : `Your change to ${esc(p.property_id)} wasn't approved`,
      `<p>Hi ${esc(firstName(agent.name))},</p>
       <p>${approved ? 'The admin approved your change, and it is now live:' : "The admin didn't approve this change, so your listing stays exactly as it was:"}</p>
       <p style="margin:0 0 6px;"><strong>${esc(p.property_id)} — ${esc(p.title)}</strong></p>
       <ul style="margin:0 0 12px;padding-left:20px;">${lines}</ul>
       ${!approved && e.admin_note ? `<p style="margin:0;"><strong>Reason from the admin:</strong></p>${quote(e.admin_note)}` : ''}
       ${approved
         ? button('View your live listing', `${siteUrl()}/properties/${encodeURIComponent(p.property_id)}`)
         : button('Open My Properties', `${siteUrl()}/agent/properties`)}
       ${approved ? '' : '<p style="color:#667085;">You can send a new change from My Properties whenever you like.</p>'}`);
    await sendToAgent(agent.email, approved ? `Your change to ${p.property_id} was approved` : `Your change to ${p.property_id} wasn't approved`, html);
  } catch (err) {
    console.error('notifyEditDecision failed:', err.message);
  }
}

module.exports = {
  notifyEditDecision,
  agentEmailsStatus, sendToAgent, escapeHtml, emailShell, button, naira, siteUrl, firstName,
  notifyListingApproved, notifyNewEnquiry, notifyNewInspection,
};
