const express = require('express');
const router = express.Router();
const db = require('../../db/connection');
const { toPublicProperty } = require('../../utils/propertySerializer');

const BUDGET_RANGES = {
  '100-150': [100000, 150000],
  '150-200': [150000, 200000],
  '200-300': [200000, 300000],
  '300-500': [300000, 500000],
  '500plus': [500000, 999999999],
};

async function getImagesFor(propertyRowIds) {
  if (!propertyRowIds.length) return {};
  const placeholders = propertyRowIds.map(() => '?').join(',');
  const rows = await db
    .prepare(`SELECT * FROM property_images WHERE property_id IN (${placeholders}) ORDER BY display_order ASC`)
    .all(...propertyRowIds);
  const map = {};
  rows.forEach((img) => {
    if (!map[img.property_id]) map[img.property_id] = [];
    map[img.property_id].push({ url: img.image_url, type: img.image_type });
  });
  return map;
}

async function hydrate(rows) {
  const imagesMap = await getImagesFor(rows.map((r) => r.id));
  return rows.map((r) => toPublicProperty(r, imagesMap[r.id]));
}

// GET /api/properties?type=&budget=&location=&bedrooms=&availability=
router.get('/', async (req, res) => {
  const { type, budget, location, bedrooms, availability } = req.query;

  // Only approved properties are ever eligible for public listing.
  let sql = `SELECT * FROM properties WHERE approval_status = 'approved'`;
  const params = [];

  if (availability && ['Available', 'Reserved', 'Rented'].includes(availability)) {
    sql += ' AND status = ?';
    params.push(availability);
  } else {
    // default public view: don't show Pending Approval / Unavailable clutter
    sql += ` AND status IN ('Available','Reserved','Rented')`;
  }

  if (type && type !== 'All') {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (location && location.trim() && location.trim().toLowerCase() !== 'all') {
    // Free-text, partial match (case-insensitive) — works whether the visitor
    // picked a suggested street or typed something of their own.
    sql += ' AND location_area LIKE ?';
    params.push(`%${location.trim()}%`);
  }
  if (bedrooms && bedrooms !== 'Any') {
    if (bedrooms === '3+') {
      sql += ' AND bedrooms >= 3';
    } else {
      sql += ' AND bedrooms = ?';
      params.push(Number(bedrooms));
    }
  }
  if (budget && BUDGET_RANGES[budget]) {
    const [min, max] = BUDGET_RANGES[budget];
    sql += ' AND price >= ? AND price <= ?';
    params.push(min, max);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = await db.prepare(sql).all(...params);
  const results = await hydrate(rows);

  let suggestions = [];
  if (results.length === 0) {
    // Nothing matched these exact filters — rather than a dead end, suggest
    // a handful of other well-rated, available homes the visitor might like.
    const fallbackRows = await db.prepare(`
      SELECT * FROM properties
      WHERE approval_status = 'approved' AND status IN ('Available','Reserved')
      ORDER BY rating DESC LIMIT 6
    `).all();
    suggestions = await hydrate(fallbackRows);
  }

  res.json({ count: results.length, results, suggestions });
});

// GET /api/properties/:propertyId  (e.g. BH-000001)
router.get('/:propertyId', async (req, res) => {
  const row = await db
    .prepare(`SELECT * FROM properties WHERE property_id = ? AND approval_status = 'approved'`)
    .get(req.params.propertyId);

  if (!row) return res.status(404).json({ error: 'Property not found.' });

  const imageRows = await db
    .prepare('SELECT * FROM property_images WHERE property_id = ? ORDER BY display_order ASC')
    .all(row.id);
  const images = imageRows.map((img) => ({ url: img.image_url, type: img.image_type }));

  res.json(toPublicProperty(row, images));
});

module.exports = router;
