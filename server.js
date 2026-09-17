require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');

const { attachUser } = require('./middleware/auth');
const seedDatabase = require('./db/seedData');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(attachUser);

// Make currentUser available to all views by default
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.siteUrl = (process.env.SITE_URL || 'https://borihomes.onrender.com').replace(/\/$/, '');
  res.locals.currentPath = req.originalUrl;
  next();
});

// ---- API routes ----
app.use('/api/properties', require('./routes/api/properties'));
app.use('/api/enquiries', require('./routes/api/enquiries'));
app.use('/api/inspections', require('./routes/api/inspections'));
app.use('/api/agent-applications', require('./routes/api/agentApplications'));
app.use('/api/auth', require('./routes/api/auth'));
app.use('/api/agent', require('./routes/api/agent'));
app.use('/api/admin', require('./routes/api/admin'));

// ---- Page routes ----
app.use('/agent', require('./routes/agentPages'));
app.use('/admin', require('./routes/adminPages'));
app.use('/', require('./routes/pages'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found', layout: 'partials/layout' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

// The database connection is now a network call (Turso), so startup itself
// is async — the schema/seed step must finish before the server starts
// accepting requests, otherwise the very first visitors could hit a
// database with no tables yet.
async function start() {
  // On first boot (fresh database, e.g. right after deploying), this creates
  // the tables and demo data automatically. If the database already has
  // properties in it (a real site already in use), this does nothing —
  // it will never overwrite real data.
  await seedDatabase({ force: false });

  app.listen(PORT, () => {
    console.log(`BoriHomes running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start BoriHomes:', err);
  process.exit(1);
});
