// Creates all tables for BoriHomes.
// PRIVATE property fields live in their own table (property_private) which is
// NEVER joined into any query that serves public/unauthenticated requests.
// This is enforced at the query layer (see routes/api/properties.js), not the UI.

const db = require('./connection');

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','agent')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT,
      photo_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS landlords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      private_address TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- PUBLIC-SAFE property data only.
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT UNIQUE NOT NULL,       -- e.g. BH-000001
      type TEXT NOT NULL,                      -- Single Room, Self Contain, 1 Bedroom, ...
      title TEXT NOT NULL,
      price INTEGER NOT NULL,                  -- annual rent in NGN
      location_area TEXT NOT NULL,             -- general area, e.g. "Near Kenpoly"
      bedrooms INTEGER NOT NULL,
      bathrooms INTEGER NOT NULL,
      description TEXT,
      amenities TEXT,                          -- JSON array string
      rating REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending Approval'
        CHECK(status IN ('Pending Approval','Available','Reserved','Rented','Unavailable')),
      approval_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(approval_status IN ('pending','approved','rejected')),
      agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      landlord_id INTEGER REFERENCES landlords(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- PRIVATE data. Only ever selected in admin/agent-authorised queries.
    CREATE TABLE IF NOT EXISTS property_private (
      property_id INTEGER PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
      full_address TEXT,
      internal_notes TEXT,
      verification_info TEXT,
      commission_info TEXT
    );

    CREATE TABLE IF NOT EXISTS property_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      image_type TEXT NOT NULL, -- room, toilet, kitchen, balcony, compound, other
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      message TEXT,
      preferred_contact TEXT DEFAULT 'phone',
      assigned_agent_id INTEGER REFERENCES agents(id),
      status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Contacted','Closed')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      agent_id INTEGER REFERENCES agents(id),
      requested_date TEXT NOT NULL,
      requested_time TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Confirmed','Completed','Cancelled')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status, approval_status);
    CREATE INDEX IF NOT EXISTS idx_images_property ON property_images(property_id);
    CREATE INDEX IF NOT EXISTS idx_enquiries_property ON enquiries(property_id);
    CREATE INDEX IF NOT EXISTS idx_inspections_property ON inspections(property_id);
  `);
}

module.exports = createSchema;
