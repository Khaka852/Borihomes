const db = require('../db/connection');

function nextPropertyId() {
  const row = db.prepare(`
    SELECT property_id FROM properties
    ORDER BY id DESC LIMIT 1
  `).get();
  let nextNum = 1;
  if (row && row.property_id) {
    const match = row.property_id.match(/BH-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `BH-${String(nextNum).padStart(6, '0')}`;
}

module.exports = { nextPropertyId };
