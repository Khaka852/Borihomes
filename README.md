# BoriHomes — Version 1

A local property listing platform for Bori, Rivers State, built with a strong initial focus on Ken Saro-Wiwa Polytechnic (Kenpoly) students looking for accommodation, and also serving other residents.

Tech stack: **Node.js + Express 5**, **SQLite** (via Node's built-in `node:sqlite` — no native compilation/Visual Studio Build Tools required), **EJS** server-rendered views, **JWT** cookie-based auth, vanilla JS on the front end (no build step required).

> **Note:** this project uses Node's *built-in* SQLite support, so `npm install` never tries to compile anything. Requires **Node.js 22 or later**.

---

## 1. Project Structure

```
borihomes/
├── server.js                 # App entry point
├── db/
│   ├── connection.js         # SQLite connection
│   ├── schema.js             # Table definitions
│   ├── seed.js                # Demo data (15 properties, agents, landlords, admin)
│   └── borihomes.sqlite       # Created after you run the seed script
├── middleware/
│   └── auth.js                # JWT verification + role-based access control
├── utils/
│   ├── propertySerializer.js  # SINGLE choke point deciding public vs private fields
│   └── idGenerator.js         # BH-000001 style property IDs
├── routes/
│   ├── pages.js                # Public pages (home, properties, detail, about, etc.)
│   ├── agentPages.js           # Agent dashboard pages
│   ├── adminPages.js           # Admin dashboard pages
│   └── api/
│       ├── properties.js       # Public property API (never touches private table)
│       ├── enquiries.js        # Public enquiry submission
│       ├── inspections.js      # Public inspection request submission
│       ├── auth.js             # Login / logout
│       ├── agent.js            # Agent-only API, scoped to their own properties
│       └── admin.js            # Admin-only API, full access
├── views/                      # EJS templates (public site, agent/, admin/, partials/)
└── public/                     # CSS, client-side JS, uploaded images
```

## 2. Database Schema

- **users** — admins and agents (role-based)
- **agents** — agent profile, linked 1:1 to a user
- **landlords** — private landlord records (name, phone, email, private address, notes)
- **properties** — all **public-safe** fields only (type, price, general area, bedrooms, description, amenities, rating, status, approval_status, property_id, agent_id, landlord_id)
- **property_private** — full address, internal notes, verification info, commission info. **Only ever joined into agent/admin-authorised queries.**
- **property_images** — 5 mandatory image types (room, toilet, kitchen, balcony, compound) + optional extras
- **enquiries** / **inspections** — customer requests, linked to property + assigned agent

## 3. How Private Landlord Information Is Protected

This is enforced at the **query and API layer**, not the UI:

1. Private fields (full address, landlord name/phone/email, internal notes, commission info) live in a **separate table** (`property_private`) and a separate `landlords` table.
2. `routes/api/properties.js` (the public API) **never joins or selects from those tables** — it is structurally incapable of returning them.
3. `utils/propertySerializer.js` is the single choke point that shapes API responses. `toPublicProperty()` only includes safe fields; `toPrivateProperty()` (which includes address/landlord/notes) is only ever called from `routes/api/agent.js` (for an agent's own assigned properties) and `routes/api/admin.js`.
4. `middleware/auth.js` verifies a JWT cookie and enforces role checks (`requireApiRole('admin')`, `requireApiRole('agent')`) on every private route — an unauthenticated request gets `401`, a wrong-role request gets `403`.
5. Agents are further scoped to **their own** properties (`agent_id` ownership check) — Agent A cannot edit or view full details of Agent B's listings.
6. This was verified during testing: `curl`-ing the public API and grepping the response for `landlord`, `full_address`, `internal_notes`, `commission` returns nothing.

## 4. Setup Instructions

### Option A — Run it live on the internet (recommended, no local install needed)

You can skip running anything on your own computer and deploy straight to a free hosting service. See **section 11: Deploying to Render** below for exact steps.

### Option B — Run it on your own computer

### Requirements
- Node.js 22+ (uses `node:sqlite`, Node's built-in database — no separate DB server, no compilation needed)

### Install & Run

```bash
cd borihomes
npm install
cp .env.example .env      # edit JWT_SECRET before deploying to production
npm run seed               # creates the database and inserts 15 demo properties
npm start                  # starts the server
```

Visit **http://localhost:3000**

### Available scripts
- `npm start` — run the server (also auto-creates the database and demo data on first run if it doesn't exist yet — safe to run repeatedly, it will never overwrite real data)
- `npm run seed` — wipe and reseed the database with fresh demo data (local dev only — do NOT run this against a live production database with real listings, it deletes everything first)

## 5. Environment Variables

| Variable      | Description                                      | Default          |
|---------------|---------------------------------------------------|------------------|
| `PORT`        | Port the server listens on                        | `3000`           |
| `JWT_SECRET`  | Secret used to sign session tokens — **change this before deploying** | `dev-secret-change-me` |
| `NODE_ENV`    | Set to `production` to enable secure cookies       | `development`    |

## 6. Test / Demo Credentials

| Role  | Email                     | Password    |
|-------|---------------------------|-------------|
| Admin | admin@borihomes.com       | Admin@123   |
| Agent | agent1@borihomes.com      | Agent@123   |
| Agent | agent2@borihomes.com      | Agent@123   |
| Agent | agent3@borihomes.com      | Agent@123   |

Log in at `/login`. Admin lands on `/admin`, agents land on `/agent`.

**Change these passwords (or delete/recreate these accounts) before putting real data or real users on this system.**

## 7. Replacing Demo Images With Real Property Photos

Demo images are plain URLs (`https://picsum.photos/seed/...`) stored per-image in the `property_images` table — they are **not** hardcoded into any component.

To swap in real photos for a property:
1. Upload your images somewhere reachable by URL (your own server, S3, Cloudinary, etc.) — or add simple local file upload later using the already-installed `multer` package to serve from `/public/uploads/`.
2. As an agent: use **My Properties → (property) → add images** via `POST /api/agent/properties/:id/images` with `{ image_url, image_type }`, or as admin, update directly via SQL/admin tooling.
3. Delete the old demo image rows once real ones are in place (a small admin UI for reordering/removing individual images can be added on top of the existing `property_images` table — it isn't in the Version 1 UI yet, but the schema already supports it).

Because the 5-photo structure (`room`, `toilet`, `kitchen`, `balcony`, `compound`, plus optional `other`) is just data in a table, no front-end redesign is needed when you switch to real photos.

## 8. Security Notes / What Was Tested

Verified during build (see "How Private Landlord Information Is Protected" above):
- Public API never returns landlord phone/email, exact address, internal notes, or commission info
- Unauthenticated requests to `/api/agent/*` and `/api/admin/*` return `401`
- An agent cannot edit/view full details of another agent's property (`403`)
- Agent page routes (`/agent/*`) redirect unauthenticated users to `/login`; admin page routes (`/admin/*`) return `403` for a logged-in agent
- New agent-submitted properties start as `Pending Approval` and are **excluded from public listings** until an admin approves them
- Filters (type, budget, location, bedrooms, availability) work against the live demo dataset without page reloads
- Passwords are hashed with bcrypt; sessions use httpOnly JWT cookies

## 9. Remaining Configuration Before Deployment

- Set a strong, random `JWT_SECRET` in production
- Set `NODE_ENV=production` so auth cookies get the `secure` flag (requires HTTPS)
- Replace demo property/landlord/agent data with real records (or keep a couple of demo accounts clearly marked for internal testing only)
- Put the app behind HTTPS (e.g. via a reverse proxy like Nginx, or your hosting platform's TLS)
- Move file uploads to a persistent object store if deploying somewhere with an ephemeral filesystem (e.g. most PaaS platforms) — local `/public/uploads` will not persist across deploys/restarts on those platforms
- Set up regular backups of `db/borihomes.sqlite` (or migrate to Postgres/MySQL for production scale — the SQL is close to standard and could be ported with modest changes)
- Add rate limiting to the public enquiry/inspection endpoints if this goes live, to reduce spam
- Review and rotate the demo admin/agent credentials listed above

## 10. Future-Ready Architecture (not built in v1, but schema/structure allows adding later)

Saved/favourite properties, public user accounts, property reviews, verified-property badges, map integration, notifications, online payments, a landlord self-service portal, roommate matching, property analytics, and a mobile app can all be layered on top of the existing `properties`, `users`, and `agents` tables without a redesign.

## 11. Deploying to Render (get a real, permanent website link)

This gets your site a real URL (like `borihomes.onrender.com`) that anyone can visit — no terminal needed on your end after this one-time setup. Total cost: free, on Render's free tier.

**Step 1 — Put the code on GitHub** (GitHub just stores your code so Render can find it)
1. Go to github.com and create a free account if you don't have one.
2. Click the **+** icon top-right → **New repository**. Name it `borihomes`, keep it Public or Private (either works), click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Drag your entire `borihomes` folder's contents (not the zip itself — the files inside it) into the upload box.
5. Scroll down, click **Commit changes**.

**Step 2 — Create a Render account and connect it**
1. Go to render.com → sign up (you can sign up directly with your GitHub account, which makes step 3 easier).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account if asked, then select your `borihomes` repository.

**Step 3 — Configure the service**
Fill in these fields:
- **Name:** `borihomes` (or anything you like — this becomes part of your URL)
- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Instance Type:** Free

**Step 4 — Add environment variables**
Still on that setup screen, find **Environment Variables** and add:
- `JWT_SECRET` → any long random string (e.g. mash your keyboard for 30 characters)
- `NODE_ENV` → `production`

**Step 5 — Deploy**
Click **Create Web Service**. Render will install everything and start your site — this takes a few minutes the first time. When it's done, you'll see a green "Live" status and a URL at the top of the page (something like `https://borihomes.onrender.com`). That's your real website link.

**A few things to know about the free tier:**
- The free instance "sleeps" after 15 minutes of no visitors, and takes ~30-50 seconds to wake back up on the next visit. This is normal on the free tier — upgrading later removes it.
- The demo data (15 sample properties, admin/agent logins) will be created automatically the first time it starts, the same way it works locally.
- **Important:** the free tier's storage isn't permanent — if Render redeploys or restarts your service in certain situations (like pushing new code changes), the database can reset back to the demo data. This is fine while you're testing, but before relying on this for real listings long-term, ask me about adding a persistent disk (Render supports this on paid plans) or migrating to a proper hosted database — I can walk you through either when you're ready for that step.
