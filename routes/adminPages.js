const express = require('express');
const router = express.Router();
const { requirePageRole } = require('../middleware/auth');

router.use(requirePageRole('admin'));

router.get('/', (req, res) => res.render('admin/dashboard', { title: 'Admin Dashboard — BoriHomes', layout: 'admin/_layout' }));
router.get('/properties', (req, res) => res.render('admin/properties', { title: 'Properties — Admin', layout: 'admin/_layout' }));
router.get('/agents', (req, res) => res.render('admin/agents', { title: 'Agents — Admin', layout: 'admin/_layout' }));
router.get('/landlords', (req, res) => res.render('admin/landlords', { title: 'Landlords — Admin', layout: 'admin/_layout' }));
router.get('/users', (req, res) => res.render('admin/users', { title: 'Users — Admin', layout: 'admin/_layout' }));
router.get('/enquiries', (req, res) => res.render('admin/enquiries', { title: 'Enquiries — Admin', layout: 'admin/_layout' }));
router.get('/inspections', (req, res) => res.render('admin/inspections', { title: 'Inspections — Admin', layout: 'admin/_layout' }));

module.exports = router;
