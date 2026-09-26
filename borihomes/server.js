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
//
// A transient network hiccup talking to Turso (or any other momentary
// issue) should NEVER take the whole site down. Previously, any error here
// caused the entire process to exit — meaning a single brief connectivity
// blip could crash the live site until Render happened to restart it again.
// Now: retry a few times with a short delay, and if it still fails, start
// the web server anyway (so the site stays reachable) rather than going
// completely dark. Database-dependent pages will show a clear error until
// the underlying issue is resolved, which is far better than the entire
// site being unreachable.
async function start() {
  const MAX_ATTEMPTS = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await seedDatabase({ force: false });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      console.error(`Database setup failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err.message);
      if (attempt < MAX_ATTEMPTS) {
        const delayMs = 2000 * attempt;
        console.log(`Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  if (lastError) {
    console.error('Database setup did not succeed after multiple attempts. Starting the web server anyway so the site stays reachable — check TURSO_DATABASE_URL / TURSO_AUTH_TOKEN and your Turso dashboard if this persists.');
  }

  app.listen(PORT, () => {
    console.log(`BoriHomes running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  // Should be unreachable now that start() itself no longer throws — kept
  // only as a last-resort safety net so a truly unexpected error is at
  // least logged clearly instead of failing silently.
  console.error('Unexpected fatal startup error:', err);
  process.exit(1);
});
