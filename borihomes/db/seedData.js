const bcrypt = require('bcryptjs');
const db = require('./connection');
const createSchema = require('./schema');

// Creates or updates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD
// environment variables. If those aren't set, falls back to the demo
// admin login (admin@borihomes.com / Admin@123) so local testing still works
// out of the box. Real credentials should always be set via environment
// variables — never hardcoded here — since this file is committed to git.
async function ensureAdminFromEnv() {
  const email = (process.env.ADMIN_EMAIL || 'admin@borihomes.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  const hash = bcrypt.hashSync(password, 10);

  const existingAdmin = await db.prepare(`SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`).get();
  if (existingAdmin) {
    await db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(email, hash, existingAdmin.id);
  } else {
    await db.prepare(`INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,'admin')`)
      .run('BoriHomes Admin', email, '', hash);
  }
}

async function hasSeededBefore() {
  const row = await db.prepare(`SELECT value FROM app_meta WHERE key = 'seeded_at'`).get();
  return Boolean(row);
}

// Catches databases that were already in use BEFORE the app_meta marker
// existed (or ended up in a half-cleaned state — e.g. some demo properties
// deleted but a demo agent login left behind). Without this, the first boot
// after this fix goes live would still try to insert the demo agents/
// properties one more time, collide with whatever's already there, and
// crash with the exact same "UNIQUE constraint failed" error this fix is
// meant to prevent.
async function hasAnyExistingData() {
  const counts = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM users').get(),
    db.prepare('SELECT COUNT(*) as c FROM properties').get(),
    db.prepare('SELECT COUNT(*) as c FROM agents').get(),
    db.prepare('SELECT COUNT(*) as c FROM landlords').get(),
  ]);
  // A count of 1 for users is expected (just the admin, synced above) —
  // anything beyond that, or any row at all in the other tables, means this
  // database has been used before in some form and must not be touched.
  return counts[0].c > 1 || counts[1].c > 0 || counts[2].c > 0 || counts[3].c > 0;
}

async function markSeeded() {
  await db.prepare(`
    INSERT INTO app_meta (key, value) VALUES ('seeded_at', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();
}

async function seedDatabase({ force = false } = {}) {
  await createSchema();

  // Keeps the admin login in sync with ADMIN_EMAIL / ADMIN_PASSWORD environment
  // variables, on every boot — regardless of whether demo data already exists.
  // This means the real admin password never has to be written into any file
  // that gets committed to GitHub; it only ever lives in your private
  // environment variables (.env locally, or the hosting platform's dashboard).
  await ensureAdminFromEnv();

  const alreadySeeded = (await hasSeededBefore()) || (await hasAnyExistingData());
  if (alreadySeeded && !force) {
    // This database has been seeded before — even if an admin has since
    // deleted every demo property/agent on purpose, we must NEVER silently
    // recreate them just because the tables look empty right now. Only an
    // explicit `npm run seed` (force: true) is allowed to repopulate demo data.
    await markSeeded(); // retroactively set the marker so future boots skip the row-count checks entirely
    console.log('Database already initialised — skipping demo data (this is expected on every normal restart/redeploy).');
    return;
  }

  if (force) {
    await db.exec(`
      DELETE FROM inspections;
      DELETE FROM enquiries;
      DELETE FROM property_images;
      DELETE FROM property_private;
      DELETE FROM properties;
      DELETE FROM landlords;
      DELETE FROM agents;
      DELETE FROM users;
      DELETE FROM agent_applications;
    `);
  }

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,?)`
  );
  const insertAgent = db.prepare(
    `INSERT INTO agents (user_id, bio, photo_url) VALUES (?,?,?)`
  );
  const insertLandlord = db.prepare(
    `INSERT INTO landlords (name, phone, email, private_address, notes) VALUES (?,?,?,?,?)`
  );
  const insertProperty = db.prepare(`
    INSERT INTO properties
    (property_id, type, title, price, location_area, bedrooms, bathrooms, description, amenities, rating, status, approval_status, agent_id, landlord_id)
    VALUES (@property_id,@type,@title,@price,@location_area,@bedrooms,@bathrooms,@description,@amenities,@rating,@status,@approval_status,@agent_id,@landlord_id)
  `);
  const insertPrivate = db.prepare(`
    INSERT INTO property_private (property_id, full_address, internal_notes, verification_info, commission_info)
    VALUES (?,?,?,?,?)
  `);
  const insertImage = db.prepare(`
    INSERT INTO property_images (property_id, image_url, image_type, display_order) VALUES (?,?,?,?)
  `);

  // --- Users: 1 admin + 3 agents ---
  // The admin row was wiped above (if force=true) — recreate it from env vars,
  // not hardcoded demo values, so a real admin password is never overwritten
  // with the demo one during a manual reseed.
  if (force) await ensureAdminFromEnv();
  const passAgent = bcrypt.hashSync('Agent@123', 10);

  const agentUsers = [
    { name: 'Chidinma Okoro', email: 'agent1@borihomes.com', phone: '08031111111' },
    { name: 'Barile Nwidor', email: 'agent2@borihomes.com', phone: '08032222222' },
    { name: 'Emeka Sorbari', email: 'agent3@borihomes.com', phone: '08033333333' },
  ];
  const agentIds = [];
  for (const a of agentUsers) {
    // Idempotent by design: if this demo agent already exists (e.g. a
    // previous seed attempt got interrupted partway through), reuse it
    // instead of crashing on a duplicate email — this is exactly what makes
    // the app self-heal from a partial/interrupted first seed.
    let userRow = await db.prepare('SELECT id FROM users WHERE email = ?').get(a.email);
    let userId;
    if (userRow) {
      userId = userRow.id;
    } else {
      const userResult = await insertUser.run(a.name, a.email, a.phone, passAgent, 'agent');
      userId = userResult.lastInsertRowid;
    }

    let agentRow = await db.prepare('SELECT id FROM agents WHERE user_id = ?').get(userId);
    let agentId;
    if (agentRow) {
      agentId = agentRow.id;
    } else {
      const agentResult = await insertAgent.run(
        userId,
        `Local BoriHomes agent covering properties near Kenpoly and central Bori.`,
        `https://i.pravatar.cc/150?u=${a.email}`
      );
      agentId = agentResult.lastInsertRowid;
    }
    agentIds.push(agentId);
  }

  // --- Landlords (demo, private) ---
  const landlordNames = [
    ['Chief Barinua Kpea', '08111111101', 'barinua.kpea@example.com'],
    ['Mrs. Ledisi Gbara', '08111111102', 'ledisi.gbara@example.com'],
    ['Mr. Solomon Vizor', '08111111103', ''],
    ['Chief Mrs. Nuka Tornwe', '08111111104', 'nuka.tornwe@example.com'],
    ['Mr. Dumle Kabari', '08111111105', ''],
    ['Elder Nyema Dumnamene', '08111111106', 'nyema.d@example.com'],
  ];
  const landlordIds = [];
  for (const [name, phone, email] of landlordNames) {
    // Same self-healing approach as agents above — avoids piling up duplicate
    // demo landlords if the seed process gets interrupted and retried.
    let existing = await db.prepare('SELECT id FROM landlords WHERE name = ? AND phone = ?').get(name, phone);
    if (existing) {
      landlordIds.push(existing.id);
      continue;
    }
    const result = await insertLandlord.run(
      name, phone, email,
      `${name.split(' ').pop()} Family House, off main road, Bori (exact address withheld)`,
      'DEMO landlord record — seed data only.'
    );
    landlordIds.push(result.lastInsertRowid);
  }

  // --- 15 demo properties ---
  const amenitiesPool = ['Water Supply', 'Prepaid Meter', 'Fenced Compound', 'Security', 'Tiled Floor', 'POP Ceiling', 'Parking Space', 'Kitchen Cabinet', 'Wardrobe', 'Generator Housing', 'Borehole', 'Close to Campus'];

  function pick(arr, n) {
    const copy = [...arr];
    const out = [];
    for (let i = 0; i < n; i++) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    return out;
  }

  const demoProperties = [
    { type: 'Single Room', title: 'Cozy Single Room Near Kenpoly Gate', price: 120000, area: 'Near Kenpoly', bed: 1, bath: 1 },
    { type: 'Single Room', title: 'Affordable Single Room for Students', price: 100000, area: 'Near Kenpoly', bed: 1, bath: 1 },
    { type: 'Self Contain', title: 'Modern Self Contain, Water & Light Steady', price: 180000, area: 'Near Kenpoly', bed: 1, bath: 1 },
    { type: 'Self Contain', title: 'Self Contain with Fenced Compound', price: 200000, area: 'Gokana Street', bed: 1, bath: 1 },
    { type: '1 Bedroom', title: 'Neat 1 Bedroom Flat, Tiled Throughout', price: 280000, area: 'Market Road', bed: 1, bath: 1 },
    { type: '1 Bedroom', title: '1 Bedroom Apartment Close to Market', price: 260000, area: 'Mayor Street', bed: 1, bath: 1 },
    { type: '2 Bedroom', title: 'Spacious 2 Bedroom Flat, Family Friendly', price: 450000, area: 'Court Road', bed: 2, bath: 2 },
    { type: '2 Bedroom', title: '2 Bedroom Apartment with Parking Space', price: 480000, area: 'Poly Road', bed: 2, bath: 2 },
    { type: '2 Bedroom', title: 'Newly Built 2 Bedroom Near Kenpoly', price: 500000, area: 'Near Kenpoly', bed: 2, bath: 1 },
    { type: '3 Bedroom', title: 'Executive 3 Bedroom Duplex Flat', price: 750000, area: 'Court Road', bed: 3, bath: 3 },
    { type: '3 Bedroom', title: '3 Bedroom Bungalow with Compound', price: 650000, area: 'Market Road', bed: 3, bath: 2 },
    { type: 'Shared Apartment', title: 'Shared Apartment, Ideal for 2 Students', price: 140000, area: 'Near Kenpoly', bed: 1, bath: 1 },
    { type: 'Shared Apartment', title: 'Roommate-Friendly Shared Flat', price: 150000, area: 'Gokana Street', bed: 2, bath: 1 },
    { type: 'Self Contain', title: 'Self Contain with Borehole Water', price: 190000, area: 'Mayor Street', bed: 1, bath: 1 },
    { type: '1 Bedroom', title: 'Well-Finished 1 Bedroom, POP Ceiling', price: 300000, area: 'Poly Road', bed: 1, bath: 1 },
  ];

  const imageTypes = ['room', 'toilet', 'kitchen', 'balcony', 'compound'];

  for (let idx = 0; idx < demoProperties.length; idx++) {
    const p = demoProperties[idx];
    const propertyId = `BH-${String(idx + 1).padStart(6, '0')}`;
    const agentId = agentIds[idx % agentIds.length];
    const landlordId = landlordIds[idx % landlordIds.length];
    const status = idx === 2 ? 'Reserved' : idx === 5 ? 'Rented' : idx === 10 ? 'Pending Approval' : 'Available';
    const approval = status === 'Pending Approval' ? 'pending' : 'approved';
    const rating = Math.round((3.5 + Math.random() * 1.5) * 10) / 10;

    // Self-healing: if this exact property already exists (from a previous
    // interrupted seed attempt), don't try to recreate it — that would hit
    // the same UNIQUE constraint that caused the original crash. Only fill
    // in whatever pieces (private data, images) are genuinely still missing.
    const existingProperty = await db.prepare('SELECT id FROM properties WHERE property_id = ?').get(propertyId);
    let propRowId;

    if (existingProperty) {
      propRowId = existingProperty.id;
    } else {
      const row = await insertProperty.run({
        property_id: propertyId,
        type: p.type,
        title: p.title,
        price: p.price,
        location_area: p.area,
        bedrooms: p.bed,
        bathrooms: p.bath,
        description: `${p.title}. A well-maintained ${p.type.toLowerCase()} located ${p.area}, suitable for students and residents in Bori. Contact the assigned agent to book an inspection.`,
        amenities: JSON.stringify(pick(amenitiesPool, 4 + Math.floor(Math.random() * 3))),
        rating,
        status,
        approval_status: approval,
        agent_id: agentId,
        landlord_id: landlordId,
      });
      propRowId = row.lastInsertRowid;
    }

    const existingPrivate = await db.prepare('SELECT property_id FROM property_private WHERE property_id = ?').get(propRowId);
    if (!existingPrivate) {
      await insertPrivate.run(
        propRowId,
        `Plot ${10 + idx}, off ${p.area} internal road, Bori, Rivers State (exact address — agent access only)`,
        `DEMO internal note: verify tenant references before handover. Landlord prefers ${idx % 2 === 0 ? 'annual' : 'bi-annual'} payment.`,
        'DEMO verification: landlord ID and C-of-O on file with admin.',
        `${Math.round(p.price * 0.1).toLocaleString()} NGN commission (10%) — internal only`
      );
    }

    const existingImages = await db.prepare('SELECT COUNT(*) as c FROM property_images WHERE property_id = ?').get(propRowId);
    if (existingImages.c === 0) {
      for (let i = 0; i < imageTypes.length; i++) {
        await insertImage.run(propRowId, `https://picsum.photos/seed/${propertyId}-${imageTypes[i]}/900/600`, imageTypes[i], i);
      }
      await insertImage.run(propRowId, `https://picsum.photos/seed/${propertyId}-extra/900/600`, 'other', 5);
    }
  }

  await markSeeded();

  console.log('Seed complete:');
  console.log(` Admin login   -> using ADMIN_EMAIL / ADMIN_PASSWORD (or the demo fallback if unset)`);
  console.log(' Agent login   -> agent1@borihomes.com / Agent@123 (also agent2@, agent3@)');
  console.log(` ${demoProperties.length} demo properties created.`);
}

module.exports = seedDatabase;
