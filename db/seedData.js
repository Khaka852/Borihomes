const bcrypt = require('bcryptjs');
const db = require('./connection');
const createSchema = require('./schema');

function seedDatabase({ force = false } = {}) {
  createSchema();

  const propertyCount = db.prepare('SELECT COUNT(*) as c FROM properties').get().c;
  if (propertyCount > 0 && !force) {
    // Database already has real data (e.g. on a redeploy) — never overwrite it silently.
    console.log('Database already has data — skipping seed.');
    return;
  }

  if (force) {
    db.exec(`
      DELETE FROM inspections;
      DELETE FROM enquiries;
      DELETE FROM property_images;
      DELETE FROM property_private;
      DELETE FROM properties;
      DELETE FROM landlords;
      DELETE FROM agents;
      DELETE FROM users;
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
  const passAdmin = bcrypt.hashSync('Admin@123', 10);
  const passAgent = bcrypt.hashSync('Agent@123', 10);

  insertUser.run('BoriHomes Admin', 'admin@borihomes.com', '08030000000', passAdmin, 'admin');

  const agentUsers = [
    { name: 'Chidinma Okoro', email: 'agent1@borihomes.com', phone: '08031111111' },
    { name: 'Barile Nwidor', email: 'agent2@borihomes.com', phone: '08032222222' },
    { name: 'Emeka Sorbari', email: 'agent3@borihomes.com', phone: '08033333333' },
  ];
  const agentIds = agentUsers.map((a) => {
    const uid = insertUser.run(a.name, a.email, a.phone, passAgent, 'agent').lastInsertRowid;
    return insertAgent.run(uid, `Local BoriHomes agent covering properties near Kenpoly and central Bori.`, `https://i.pravatar.cc/150?u=${a.email}`).lastInsertRowid;
  });

  // --- Landlords (demo, private) ---
  const landlordNames = [
    ['Chief Barinua Kpea', '08111111101', 'barinua.kpea@example.com'],
    ['Mrs. Ledisi Gbara', '08111111102', 'ledisi.gbara@example.com'],
    ['Mr. Solomon Vizor', '08111111103', ''],
    ['Chief Mrs. Nuka Tornwe', '08111111104', 'nuka.tornwe@example.com'],
    ['Mr. Dumle Kabari', '08111111105', ''],
    ['Elder Nyema Dumnamene', '08111111106', 'nyema.d@example.com'],
  ];
  const landlordIds = landlordNames.map(([name, phone, email]) =>
    insertLandlord.run(name, phone, email, `${name.split(' ').pop()} Family House, off main road, Bori (exact address withheld)`, 'DEMO landlord record — seed data only.').lastInsertRowid
  );

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
    { type: 'Self Contain', title: 'Self Contain with Fenced Compound', price: 200000, area: 'Kpean Road Area', bed: 1, bath: 1 },
    { type: '1 Bedroom', title: 'Neat 1 Bedroom Flat, Tiled Throughout', price: 280000, area: 'Bori Town Centre', bed: 1, bath: 1 },
    { type: '1 Bedroom', title: '1 Bedroom Apartment Close to Market', price: 260000, area: 'Zaakpon Junction', bed: 1, bath: 1 },
    { type: '2 Bedroom', title: 'Spacious 2 Bedroom Flat, Family Friendly', price: 450000, area: 'Government Layout, Bori', bed: 2, bath: 2 },
    { type: '2 Bedroom', title: '2 Bedroom Apartment with Parking Space', price: 480000, area: 'Bori-Kono Road', bed: 2, bath: 2 },
    { type: '2 Bedroom', title: 'Newly Built 2 Bedroom Near Kenpoly', price: 500000, area: 'Near Kenpoly', bed: 2, bath: 1 },
    { type: '3 Bedroom', title: 'Executive 3 Bedroom Duplex Flat', price: 750000, area: 'Government Layout, Bori', bed: 3, bath: 3 },
    { type: '3 Bedroom', title: '3 Bedroom Bungalow with Compound', price: 650000, area: 'Bori Town Centre', bed: 3, bath: 2 },
    { type: 'Shared Apartment', title: 'Shared Apartment, Ideal for 2 Students', price: 140000, area: 'Near Kenpoly', bed: 1, bath: 1 },
    { type: 'Shared Apartment', title: 'Roommate-Friendly Shared Flat', price: 150000, area: 'Kpean Road Area', bed: 2, bath: 1 },
    { type: 'Self Contain', title: 'Self Contain with Borehole Water', price: 190000, area: 'Zaakpon Junction', bed: 1, bath: 1 },
    { type: '1 Bedroom', title: 'Well-Finished 1 Bedroom, POP Ceiling', price: 300000, area: 'Bori-Kono Road', bed: 1, bath: 1 },
  ];

  const imageTypes = ['room', 'toilet', 'kitchen', 'balcony', 'compound'];

  demoProperties.forEach((p, idx) => {
    const propertyId = `BH-${String(idx + 1).padStart(6, '0')}`;
    const agentId = agentIds[idx % agentIds.length];
    const landlordId = landlordIds[idx % landlordIds.length];
    const status = idx === 2 ? 'Reserved' : idx === 5 ? 'Rented' : idx === 10 ? 'Pending Approval' : 'Available';
    const approval = status === 'Pending Approval' ? 'pending' : 'approved';
    const rating = Math.round((3.5 + Math.random() * 1.5) * 10) / 10;

    const row = insertProperty.run({
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

    const propRowId = row.lastInsertRowid;

    insertPrivate.run(
      propRowId,
      `Plot ${10 + idx}, off ${p.area} internal road, Bori, Rivers State (exact address — agent access only)`,
      `DEMO internal note: verify tenant references before handover. Landlord prefers ${idx % 2 === 0 ? 'annual' : 'bi-annual'} payment.`,
      'DEMO verification: landlord ID and C-of-O on file with admin.',
      `${Math.round(p.price * 0.1).toLocaleString()} NGN commission (10%) — internal only`
    );

    imageTypes.forEach((type, i) => {
      insertImage.run(propRowId, `https://picsum.photos/seed/${propertyId}-${type}/900/600`, type, i);
    });
    insertImage.run(propRowId, `https://picsum.photos/seed/${propertyId}-extra/900/600`, 'other', 5);
  });

  console.log('Seed complete:');
  console.log(' Admin login   -> admin@borihomes.com / Admin@123');
  console.log(' Agent login   -> agent1@borihomes.com / Agent@123 (also agent2@, agent3@)');
  console.log(` ${demoProperties.length} demo properties created.`);
}

module.exports = seedDatabase;
