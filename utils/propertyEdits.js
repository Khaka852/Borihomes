// Changes agents ask to make to a LIVE listing.
//
// An agent never edits a live listing directly. They send a request; the
// public keeps seeing the current version until the admin approves it
// (see routes/api/agentEdits.js and routes/api/adminEdits.js).
//
// Only the fields listed in FIELDS can ever be changed this way. Photos,
// landlord details, the approval status and the rating are not editable here.

const db = require('../db/connection');
const { sanitizeExtraFees, parseExtraFees } = require('./fees');

const FIELDS = ['status', 'price', 'title', 'type', 'location_area', 'bedrooms', 'bathrooms', 'description', 'amenities', 'extra_fees'];
const STATUSES = ['Available', 'Reserved', 'Rented', 'Unavailable'];
const TYPES = ['Single Room', 'Self Contain', '1 Bedroom', '2 Bedroom', '3 Bedroom', 'Shared Apartment'];
const LABELS = {
  status: 'Availability', price: 'Rent per year', title: 'Title', type: 'Property type', location_area: 'Location',
  bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', description: 'Description', amenities: 'Amenities', extra_fees: 'Extra fees',
};

class EditError extends Error {}
const fail = (message) => { throw new EditError(message); };

function num(v) {
  if (typeof v === 'string') v = v.trim();
  if (v === '' || v === null || v === undefined || typeof v === 'boolean' || Array.isArray(v)) return NaN;
  return Number(v);
}
function text(v, label, max) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) fail(`${label} can't be empty.`);
  if (s.length > max) fail(`${label} is too long (max ${max} characters).`);
  return s;
}
function whole(v, label, min, max) {
  const n = num(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
}

// How each field is cleaned up and checked. Every function returns the clean
// value or throws an EditError with a message that's fine to show the agent.
const NORMALIZE = {
  status: (v) => (STATUSES.includes(v) ? v : fail('Pick a valid availability.')),
  price: (v) => {
    const n = Math.round(num(v));
    if (!Number.isFinite(n) || n < 1 || n > 10000000000) fail('Rent must be an amount above zero.');
    return n;
  },
  title: (v) => text(v, 'Title', 120),
  type: (v) => (TYPES.includes(v) ? v : fail('Pick a valid property type.')),
  location_area: (v) => text(v, 'Location', 100),
  bedrooms: (v) => whole(v, 'Bedrooms', 0, 50),
  bathrooms: (v) => whole(v, 'Bathrooms', 0, 50),
  description: (v) => text(v, 'Description', 4000),
  amenities: (v) => {
    if (!Array.isArray(v)) fail('Amenities must be a list.');
    if (v.length > 30) fail('You can list up to 30 amenities.');
    return v.map((a) => text(a, 'Each amenity', 40));
  },
  extra_fees: (v) => {
    const check = sanitizeExtraFees(v);
    if (!check.ok) fail(check.error);
    return check.fees;
  },
};

function parseAmenities(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : []; } catch (e) { return []; }
}
function currentValue(row, field) {
  if (field === 'amenities') return parseAmenities(row.amenities);
  if (field === 'extra_fees') return parseExtraFees(row.extra_fees);
  return row[field];
}
function sameValue(field, a, b) {
  if (field === 'amenities' || field === 'extra_fees') return JSON.stringify(a) === JSON.stringify(b);
  if (field === 'price' || field === 'bedrooms' || field === 'bathrooms') return num(a) === num(b);
  const s = (x) => String(x === null || x === undefined ? '' : x).trim();
  return s(a) === s(b);
}

// Works out which fields the agent actually changed.
// Returns { ok: true, changes } or { ok: false, error }.
function buildChanges(input, row) {
  const changes = {};
  try {
    for (const field of FIELDS) {
      if (!input || input[field] === undefined) continue;
      const raw = input[field];
      const cur = currentValue(row, field);
      // Untouched fields are skipped without re-checking, so an older listing
      // whose existing values wouldn't pass today's rules can still be edited.
      if (sameValue(field, raw, cur)) continue;
      const next = NORMALIZE[field](raw);
      if (sameValue(field, next, cur)) continue;
      changes[field] = next;
    }
  } catch (e) {
    if (e instanceof EditError) return { ok: false, error: e.message };
    throw e;
  }
  if (Object.keys(changes).length === 0) return { ok: false, error: "You haven't changed anything." };
  return { ok: true, changes };
}

function display(field, value) {
  if (field === 'price') return '₦' + Number(value).toLocaleString('en-NG');
  if (field === 'amenities') return value.length ? value.join(', ') : 'None';
  if (field === 'extra_fees') return value.length ? value.map((f) => `${f.name} ₦${Number(f.amount).toLocaleString('en-NG')}`).join(', ') : 'None';
  return String(value === null || value === undefined ? '' : value);
}

// Plain-text (NOT html) "from -> to" lines for screens and emails. Callers must escape them.
function describeChanges(row, changes) {
  return FIELDS.filter((f) => f in changes).map((f) => ({
    field: f, label: LABELS[f], from: display(f, currentValue(row, f)), to: display(f, changes[f]),
  }));
}
function describeProposed(changes) {
  return FIELDS.filter((f) => f in changes).map((f) => ({ field: f, label: LABELS[f], to: display(f, changes[f]) }));
}

// Reads stored changes back, keeping only fields that are allowed.
function parseChanges(json) {
  let v;
  try { v = JSON.parse(json); } catch (e) { return {}; }
  const out = {};
  if (v && typeof v === 'object') FIELDS.forEach((f) => { if (f in v) out[f] = v[f]; });
  return out;
}

// Writes approved changes to the live listing. Column names come from the
// fixed FIELDS list above, never from user input.
async function applyChanges(propertyRowId, changes) {
  const sets = [];
  const params = [];
  for (const field of FIELDS) {
    if (!(field in changes)) continue;
    let value = changes[field];
    if (field === 'amenities') value = JSON.stringify(value);
    if (field === 'extra_fees') value = value.length ? JSON.stringify(value) : null;
    sets.push(`${field} = ?`);
    params.push(value);
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  params.push(propertyRowId);
  await db.prepare(`UPDATE properties SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

module.exports = { FIELDS, STATUSES, TYPES, buildChanges, describeChanges, describeProposed, parseChanges, applyChanges };
