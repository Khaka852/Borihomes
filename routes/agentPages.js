const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requirePageRole } = require('../middleware/auth');

router.use(requirePageRole('agent'));

router.get('/', (req, res) => {
  const agentId = req.user.agentId;
  const stats = {
    total: db.prepare('SELECT COUNT(*) c FROM properties WHERE agent_id=?').get(agentId).c,
    available: db.prepare("SELECT COUNT(*) c FROM properties WHERE agent_id=? AND status='Available'").get(agentId).c,
    rented: db.prepare("SELECT COUNT(*) c FROM properties WHERE agent_id=? AND status='Rented'").get(agentId).c,
    newEnquiries: db.prepare("SELECT COUNT(*) c FROM enquiries WHERE assigned_agent_id=? AND status='New'").get(agentId).c,
    pendingInspections: db.prepare("SELECT COUNT(*) c FROM inspections WHERE agent_id=? AND status='Pending'").get(agentId).c,
  };
  res.render('agent/dashboard', { title: 'Agent Dashboard — BoriHomes', layout: 'agent/_layout', stats });
});

router.get('/properties', (req, res) => {
  res.render('agent/properties', { title: 'My Properties — BoriHomes', layout: 'agent/_layout' });
});

router.get('/add-property', (req, res) => {
  res.render('agent/add-property', { title: 'Add Property — BoriHomes', layout: 'agent/_layout' });
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
