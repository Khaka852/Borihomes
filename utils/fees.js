// Agent fee + extra move-in fees (caution, drink, ...), shown openly to renters.
//
// The agent fee percentage lives in ONE place: the AGENT_FEE_PERCENT setting
// (default 10). It is charged on the yearly rent only, not on the extra fees.
// Extra fees are optional and stored per property as a small JSON list.

const MAX_EXTRA_FEES = 8;
const MAX_FEE_NAME_LENGTH = 40;
const MAX_FEE_AMOUNT = 1000000000;

function agentFeePercent() {
  const raw = process.env.AGENT_FEE_PERCENT;
  if (raw === undefined || String(raw).trim() === '') return 10;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 10;
}

function isValidFee(f) {
  return f && typeof f.name === 'string' && f.name.trim() !== ''
    && Number.isFinite(Number(f.amount)) && Number(f.amount) > 0;
}

// Reads the stored JSON back into a clean list (never throws).
function parseExtraFees(json) {
  try {
    const v = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(v)
      ? v.filter(isValidFee).map((f) => ({ name: String(f.name).trim(), amount: Math.round(Number(f.amount)) }))
      : [];
  } catch (e) {
    return [];
  }
}

// Checks what an agent submitted. Returns { ok: true, fees } or { ok: false, error }.
function sanitizeExtraFees(input) {
  if (input === undefined || input === null || input === '') return { ok: true, fees: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'Extra fees must be a list.' };
  if (input.length > MAX_EXTRA_FEES) return { ok: false, error: `You can add up to ${MAX_EXTRA_FEES} extra fees.` };
  const fees = [];
  for (const f of input) {
    const name = f && typeof f.name === 'string' ? f.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > MAX_FEE_NAME_LENGTH) {
      return { ok: false, error: `Each extra fee needs a name (up to ${MAX_FEE_NAME_LENGTH} characters).` };
    }
    const amount = Math.round(Number(f.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > MAX_FEE_AMOUNT) {
      return { ok: false, error: 'Each extra fee needs an amount above zero.' };
    }
    fees.push({ name, amount });
  }
  return { ok: true, fees };
}

// Short line shown under the rent on property cards.
function feeNote(percent, extraFees) {
  const hasExtras = Array.isArray(extraFees) && extraFees.length > 0;
  if (percent > 0 && hasExtras) return `+ ${percent}% agent fee + other fees`;
  if (percent > 0) return `+ ${percent}% agent fee`;
  if (hasExtras) return '+ other fees';
  return '';
}

// Full breakdown for the property page.
function computeFees(rent, extraFees, percent = agentFeePercent()) {
  const rentAmount = Number(rent) || 0;
  const extras = Array.isArray(extraFees) ? extraFees : [];
  const agentFee = Math.round((rentAmount * percent) / 100);
  const extraTotal = extras.reduce((sum, f) => sum + f.amount, 0);
  return { rent: rentAmount, percent, agentFee, extraFees: extras, extraTotal, total: rentAmount + agentFee + extraTotal };
}

module.exports = { agentFeePercent, parseExtraFees, sanitizeExtraFees, feeNote, computeFees };
