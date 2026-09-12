// Converts a Nigerian phone number in local format (e.g. 08031234567) into
// the international format WhatsApp's click-to-chat links require
// (e.g. 2348031234567 — no +, no leading 0, no spaces or dashes).
function toWhatsAppNumber(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/[^\d]/g, ''); // strip spaces, dashes, +, etc.

  if (digits.startsWith('234')) {
    // already international, leave as-is
  } else if (digits.startsWith('0')) {
    digits = '234' + digits.slice(1); // 0803... -> 234803...
  } else {
    digits = '234' + digits; // assume a bare local number missing the leading 0
  }
  return digits;
}

// Builds a wa.me click-to-chat link with a pre-filled message.
function buildWhatsAppLink(phone, message) {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

module.exports = { toWhatsAppNumber, buildWhatsAppLink };
