// Manual command: `npm run seed`
// Wipes and recreates all demo data. Use this for local development only —
// do NOT run this against a live site with real properties, it will delete them.
const seedDatabase = require('./seedData');
seedDatabase({ force: true });
