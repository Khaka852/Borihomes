const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requirePageRole } = require('../middleware/auth');
const { KNOWN_AREAS } = require('../utils/locations');

router.use(requirePageRole('agent'));

router.get('/', async (req, res) => {
  const agentId = req.user.agentId;
  const stats = {
    total: (await db.prepare('SELECT COUNT(*) c FROM properties WHERE agent_id=?').get(agentId)).c,
    available: (await db.prepare("SELECT COUNT(*) c FROM properties WHERE agent_id=? AND status='Available'").get(agentId)).c,
    rented: (await db.prepare("SELECT COUNT(*) c FROM properties WHERE agent_id=? AND status='Rented'").get(agentId)).c,
    newEnquiries: (await db.prepare("SELECT COUNT(*) c FROM enquiries WHERE assigned_agent_id=? AND status='New'").get(agentId)).c,
    pendingInspections: (await db.prepare("SELECT COUNT(*) c FROM inspections WHERE agent_id=? AND status='Pending'").get(agentId)).c,
  };
  res.render('agent/dashboard', { title: 'Agent Dashboard — BoriHomes', layout: 'agent/_layout', stats });
});

router.get('/properties', (req, res) => {
  res.render('agent/properties', { title: 'My Properties — BoriHomes', layout: 'agent/_layout' });
});

router.get('/add-property', (req, res) => {
  const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || null;
  const cloudinaryUploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || null;
  res.render('agent/add-property', {
    title: 'Add Property — BoriHomes',
    layout: 'agent/_layout',
    locations: KNOWN_AREAS,
    cloudinaryCloudName,
    cloudinaryUploadPreset,
    photosEnabled: Boolean(cloudinaryCloudName && cloudinaryUploadPreset),
  });
});

router.get('/enquiries', (req, res) => {
  res.render('agent/enquiries', { title: 'Enquiries — BoriHomes', layout: 'agent/_layout' });
});

router.get('/inspections', (req, res) => {
  res.render('agent/inspections', { title: 'Inspections — BoriHomes', layout: 'agent/_layout' });
});

router.get('/profile', (req, res) => {
  res.render('agent/profile', { title: 'Profile — BoriHomes', layout: 'agent/_layout' });
});

module.exports = router;
