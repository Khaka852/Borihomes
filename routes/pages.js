const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { toPublicProperty } = require('../utils/propertySerializer');
const { KNOWN_AREAS } = require('../utils/locations');

async function getPublicFeatured(limit = 6) {
  const rows = await db.prepare(`
    SELECT * FROM properties WHERE approval_status='approved' AND status IN ('Available','Reserved')
    ORDER BY rating DESC LIMIT ?
  `).all(limit);
  const results = [];
  for (const r of rows) {
    const imageRows = await db.prepare('SELECT * FROM property_images WHERE property_id=? ORDER BY display_order').all(r.id);
    const images = imageRows.map((i) => ({ url: i.image_url, type: i.image_type }));
    results.push(toPublicProperty(r, images));
  }
  return results;
}

router.get('/', async (req, res) => {
  res.render('index', {
    title: 'BoriHomes — Find Affordable Homes in Bori, Rivers State',
    description: 'Search single rooms, self-contains, and 1-3 bedroom flats for rent in Bori, Rivers State — including listings near Ken Saro-Wiwa Polytechnic (Kenpoly). Verified agents, transparent pricing.',
    featured: await getPublicFeatured(6),
    locations: KNOWN_AREAS,
  });
});

router.get('/properties', (req, res) => {
  res.render('properties', {
    title: 'Houses & Rooms for Rent in Bori — BoriHomes',
    description: 'Browse available rooms, self-contains, and flats for rent in Bori, Rivers State. Filter by budget, location (including Near Kenpoly), bedrooms and availability.',
    locations: KNOWN_AREAS,
  });
});

router.get('/properties/:id', async (req, res) => {
  const row = await db.prepare(`SELECT * FROM properties WHERE property_id=?`).get(req.params.id);
  if (!row) return res.status(404).render('404', { title: 'Property Not Found — BoriHomes' });

  // Public visitors only ever see approved listings. Admins can preview any
  // property (that's the whole point of the "View" button on the admin
  // properties page — you need to see it before deciding to approve it).
  // The assigned agent can also preview their own pending submission.
  const isAdmin = req.user && req.user.role === 'admin';
  const isOwningAgent = req.user && req.user.role === 'agent' && req.user.agentId === row.agent_id;
  const isPrivilegedViewer = isAdmin || isOwningAgent;

  if (row.approval_status !== 'approved' && !isPrivilegedViewer) {
    return res.status(404).render('404', { title: 'Property Not Found — BoriHomes' });
  }

  const imageRows = await db.prepare('SELECT * FROM property_images WHERE property_id=? ORDER BY display_order').all(row.id);
  const images = imageRows.map((i) => ({ url: i.image_url, type: i.image_type }));
  const property = toPublicProperty(row, images);
  res.render('property-detail', {
    title: `${property.title} — ${property.location_area}, Bori | BoriHomes`,
    description: `${property.type} for rent in ${property.location_area}, Bori, Rivers State — ₦${Number(property.price).toLocaleString('en-NG')}/year. ${property.bedrooms} bedroom(s), ${property.bathrooms} bathroom(s). Property ID: ${property.id}.`,
    ogImage: property.images[0] ? property.images[0].url : undefined,
    property,
    previewNotice: row.approval_status !== 'approved' ? row.approval_status : null,
  });
});

router.get('/about', (req, res) => res.render('about', {
  title: 'About BoriHomes — Local Property Listings in Bori',
  description: 'BoriHomes helps Kenpoly students and Bori residents find safe, affordable accommodation, while keeping landlord contact details private and verified through our agents.',
}));
router.get('/how-it-works', (req, res) => res.render('how-it-works', {
  title: 'How It Works — BoriHomes',
  description: 'Search, explore, contact an agent, and book an inspection — here is how to find your next home in Bori with BoriHomes in four simple steps.',
}));
router.get('/contact', (req, res) => res.render('contact', {
  title: 'Contact BoriHomes',
  description: 'Get in touch with BoriHomes for questions about renting or listing a property in Bori, Rivers State.',
}));

router.get('/become-agent', (req, res) => res.render('become-agent', {
  title: 'Become an Agent — BoriHomes',
  description: 'List your properties on BoriHomes and connect with Kenpoly students and residents looking for accommodation in Bori, Rivers State.',
}));

// Dynamic sitemap — automatically includes every approved property page,
// so new listings get discovered by search engines without any manual work.
router.get('/sitemap.xml', async (req, res) => {
  const siteUrl = (process.env.SITE_URL || 'https://borihomes.onrender.com').replace(/\/$/, '');
  const staticPages = ['', '/properties', '/about', '/how-it-works', '/contact'];
  const properties = await db.prepare(`SELECT property_id, updated_at FROM properties WHERE approval_status='approved'`).all();

  const urls = [
    ...staticPages.map((p) => `<url><loc>${siteUrl}${p}</loc></url>`),
    ...properties.map((p) => `<url><loc>${siteUrl}/properties/${p.property_id}</loc><lastmod>${(p.updated_at || '').slice(0, 10)}</lastmod></url>`),
  ];

  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/agent');
  res.render('login', { title: 'Agent / Admin Login — BoriHomes', layout: false });
});

module.exports = router;
