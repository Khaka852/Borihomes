const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { toPublicProperty } = require('../utils/propertySerializer');

function getPublicFeatured(limit = 6) {
  const rows = db.prepare(`
    SELECT * FROM properties WHERE approval_status='approved' AND status IN ('Available','Reserved')
    ORDER BY rating DESC LIMIT ?
  `).all(limit);
  return rows.map((r) => {
    const images = db.prepare('SELECT * FROM property_images WHERE property_id=? ORDER BY display_order').all(r.id)
      .map((i) => ({ url: i.image_url, type: i.image_type }));
    return toPublicProperty(r, images);
  });
}

router.get('/', (req, res) => {
  res.render('index', { title: 'BoriHomes — Find Your Place in Bori', featured: getPublicFeatured(6) });
});

router.get('/properties', (req, res) => {
  res.render('properties', { title: 'Find a Home — BoriHomes' });
});

router.get('/properties/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM properties WHERE property_id=? AND approval_status='approved'`).get(req.params.id);
  if (!row) return res.status(404).render('404', { title: 'Property Not Found' });
  const images = db.prepare('SELECT * FROM property_images WHERE property_id=? ORDER BY display_order').all(row.id)
    .map((i) => ({ url: i.image_url, type: i.image_type }));
  const property = toPublicProperty(row, images);
  res.render('property-detail', { title: `${property.title} — BoriHomes`, property });
});

router.get('/about', (req, res) => res.render('about', { title: 'About — BoriHomes' }));
router.get('/how-it-works', (req, res) => res.render('how-it-works', { title: 'How It Works — BoriHomes' }));
router.get('/contact', (req, res) => res.render('contact', { title: 'Contact — BoriHomes' }));

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/agent');
  res.render('login', { title: 'Login — BoriHomes', layout: false });
});

module.exports = router;
