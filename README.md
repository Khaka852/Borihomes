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
| `SITE_URL`    | Your real live URL, used for SEO tags and sharing previews | `https://borihomes.onrender.com` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Your real admin login — see section 6  | demo fallback    |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Hosted database — see section 15. Without these, data does NOT survive redeploys | local file fallback |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_UPLOAD_PRESET` | Photo upload — see section 7. Without these, photo upload is disabled | disabled |

## 6. Admin & Demo Credentials

**Admin login is not hardcoded anywhere in this code** — it's controlled entirely by two environment variables, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. This is deliberate: since this project may live in a public GitHub repository, a real password must never be written into a file that gets committed there.

- **Locally:** set them in your `.env` file (which is already git-ignored, so it stays private).
- **On Render (or any host):** set them as environment variables in the hosting dashboard — never in code.
- If left unset, the app falls back to a demo login (`admin@borihomes.com` / `Admin@123`) so local testing works out of the box.
- These sync automatically every time the server starts — change the environment variable and restart, and the admin login updates immediately, without touching the database by hand.

| Role  | Email                     | Password    |
|-------|---------------------------|-------------|
| Admin | *set via `ADMIN_EMAIL` / `ADMIN_PASSWORD`* | *set via env vars* |
| Agent (demo) | agent1@borihomes.com | Agent@123   |
| Agent (demo) | agent2@borihomes.com | Agent@123   |
| Agent (demo) | agent3@borihomes.com | Agent@123   |

Log in at `/login`. Admin lands on `/admin`, agents land on `/agent`.

**The demo agent accounts and passwords above ARE in the code** (they're clearly fake placeholders, not real credentials) — replace or delete them via the admin dashboard once you have real agents.

## 7. Adding Real Property Photos (Cloudinary Setup)

Agents can upload photos directly from the **Add Property** form — 5 required slots (Room/Interior, Toilet/Bathroom, Kitchen, Balcony/Exterior, Full Compound) plus optional extras. Photos upload straight from the browser to **Cloudinary** (a free image hosting service), never touching Render's own disk — this matters because Render's free-tier storage doesn't survive redeploys, so photos need to live somewhere permanent, same reasoning as the Turso database move above.

**One-time setup (you do this once, takes about 5 minutes):**
1. Go to **cloudinary.com** → sign up for a free account (25GB storage, no card required).
2. On your Cloudinary dashboard, note your **Cloud Name** (shown right at the top).
3. Go to **Settings → Upload** → scroll to "Upload presets" → click **Add upload preset**.
4. Set **Signing Mode** to **Unsigned** (important — this lets the browser upload directly without needing a secret key on the server). Save it and note the **preset name**.
5. Add both values as environment variables:
   - `CLOUDINARY_CLOUD_NAME` = your cloud name
   - `CLOUDINARY_UPLOAD_PRESET` = your preset name

That's it — no code changes needed. Until these are set, the Add Property form shows a friendly notice that photo upload isn't configured yet, and agents can still add properties without photos (and add photos later once this is set up).

**Note on the "unsigned" preset:** this is Cloudinary's intended, safe way to allow direct browser uploads — the cloud name and preset name are not secrets and are fine to be visible in the page's source code. Do not confuse this with your Cloudinary **API Secret**, which should never be used this way and isn't needed for this setup at all.

## 8. Security Notes / What Was Tested

Verified during build (see "How Private Landlord Information Is Protected" above):
- Public API never returns landlord phone/email, exact address, internal notes, or commission info
- Unauthenticated requests to `/api/agent/*` and `/api/admin/*` return `401`
- An agent cannot edit/view full details of another agent's property (`403`)
- Agent page routes (`/agent/*`) redirect unauthenticated users to `/login`; admin page routes (`/admin/*`) return `403` for a logged-in agent
- New agent-submitted properties start as `Pending Approval` and are **excluded from public listings** until an admin approves them
- Filters (type, budget, location, bedrooms, availability) work against the live demo dataset without page reloads
- Passwords are hashed with bcrypt; sessions use httpOnly JWT cookies
- **Login brute-force protection:** `/api/auth/login` is rate-limited — after 8 attempts from the same device/network within 15 minutes, further attempts are blocked for a cooldown period. Tested: 8 failed attempts return `401`, the 9th+ return `429`.
- **Public form spam protection:** the enquiry and inspection forms are rate-limited to 10 submissions per 15 minutes per device, to blunt spam bots without blocking a real visitor.

**Note on the admin/agent login page being publicly reachable:** this is normal — nearly every website's admin area works this way. Security comes from what protects it (hashed passwords, rate limiting, generic error messages that don't reveal whether an email exists), not from hiding the page's existence.

## 9. Remaining Configuration Before Deployment

- Set a strong, random `JWT_SECRET` in production
- Set `NODE_ENV=production` so auth cookies get the `secure` flag (requires HTTPS)
- Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (see section 16 below) — without these, the site falls back to a local file that does NOT survive redeploys
- Set `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` (see section 7 above) to enable photo upload
- Replace the demo admin/agent passwords with strong, unique real ones before real use
- Replace demo property/landlord/agent data with real records (or keep a couple of demo accounts clearly marked for internal testing only)
- Put the app behind HTTPS (Render provides this automatically)
- Turso's free tier keeps 1 day of backup history — for anything beyond that, periodically export your data (Turso's own dashboard/CLI supports this)
- Consider adding 2-factor authentication on your GitHub and hosting accounts (these control your live site and code, separate from the app's own login)

## 10. Future-Ready Architecture (not built in v1, but schema/structure allows adding later)

Saved/favourite properties, public user accounts, property reviews, verified-property badges, map integration, online payments, a landlord self-service portal, roommate matching, property analytics, and a mobile app can all be layered on top of the existing `properties`, `users`, and `agents` tables without a redesign.

## 11. Email Notifications for New Enquiries & Inspections (optional)

By default, admins/agents only see new enquiries and inspection requests by checking their dashboard. You can optionally get emailed the moment one comes in, using a free [Resend](https://resend.com) account.

**Setup:**
1. Create a free account at resend.com and grab an API key from the dashboard (API Keys → Create API Key).
2. **Do not put this key in any file that gets committed to GitHub** — especially since this repo may be public. Instead, add it directly as an environment variable in your hosting dashboard (e.g. Render → your service → Environment).
3. Add these environment variables on Render (or in your local `.env` for testing):
   - `RESEND_API_KEY` — the key from Resend
   - `ADMIN_NOTIFICATION_EMAIL` — the email address that should receive notifications
   - `RESEND_FROM_ADDRESS` — optional, defaults to `BoriHomes <onboarding@resend.dev>`

**Important limitation:** until you verify your own sending domain on Resend, their free/sandbox mode only allows sending emails **to the same email address the Resend account was signed up with**. This is a restriction from Resend, not a bug here. If you want to notify a different email address (or multiple people), verify a domain on Resend first.

If these environment variables aren't set, the site works exactly as before — it just skips sending the email (logged quietly, doesn't affect the customer's enquiry/inspection submission in any way).

## 12. WhatsApp Connection for Customers

After a customer submits an enquiry or inspection request, they're shown a "Chat on WhatsApp" button that opens a pre-filled conversation directly with the assigned agent's WhatsApp number — no extra setup required, this works automatically using each agent's phone number already on file. Just make sure agent phone numbers are entered in the format they'd normally be dialled locally (e.g. `08031234567`) — the system converts this to WhatsApp's required international format automatically.

## 13. Location Search — How Areas/Streets Work

The location field (on the homepage search box and the properties filter page) is a **free-typing field with suggestions**, not a locked dropdown:

- `utils/locations.js` holds a starter list of known Bori streets/areas — this powers the autocomplete suggestions people see as they type, and the same list is offered to agents in "Add Property".
- A visitor can either pick a suggestion or **type absolutely anything** — the search does a partial, case-insensitive match against whatever's actually stored in the database. It is never limited to the preset list.
- **Agents aren't limited to the preset list either** — the "Add Property" form lets them pick a known street or choose "Other" and type a brand-new one. That new area instantly becomes findable by customers typing it in, with zero code changes needed.
- To add more streets to the autocomplete suggestions permanently, just add them to the array in `utils/locations.js` — no other file needs to change.
- **When a search returns no matches**, instead of a dead end, the visitor is shown a friendly message and a handful of other well-rated, available properties they might like instead (see `routes/api/properties.js`, the `suggestions` field in the API response).

## 14. SEO — Getting Found on Google

Deploying this site doesn't automatically get it "indexed" — that only happens once Google's own crawlers visit it. What's already built in to make that process work well once it's live:

- Every page has a unique, keyword-relevant title and description (not one generic blurb copy-pasted everywhere)
- `/robots.txt` explicitly allows crawling of public pages and blocks admin/agent areas
- `/sitemap.xml` is generated automatically and always current — every approved property gets its own entry the moment it's approved, no manual work needed
- Social share previews (WhatsApp, Facebook, Twitter/X) show your logo, page title, and description when someone pastes a BoriHomes link into a chat
- Structured data (the technical format search engines use to understand "this is a business" / "this is a listing with a price") is embedded on the homepage and every property page

**What to actually do once the site is live, to get indexed faster than waiting passively:**

1. Set the `SITE_URL` environment variable on Render to your real live URL (e.g. `https://borihomes.onrender.com`, or your custom domain later) — this makes all the SEO tags above point to the right place.
2. Go to **search.google.com/search-console** → sign in with any Google account → add your site (use the "URL prefix" method) → verify ownership (Google offers simple options like a small file upload or a DNS record).
3. Once verified, submit your sitemap: paste `https://yoursite.onrender.com/sitemap.xml` under "Sitemaps" in Search Console.
4. That's genuinely it — Google typically starts indexing pages within a few days to two weeks. There's no legitimate way to force it faster.

**Keywords this site is already built around** (in page titles/descriptions): "houses for rent in Bori", "self contain Bori Rivers State", "accommodation near Kenpoly", "rooms for rent Bori Rivers State". As you add real listings, keep using natural phrases like these in property titles and descriptions — that helps ranking more than any technical trick.

## 15. Turso Database Setup (keeps real data safe across every redeploy)

Without this, the site stores its database as a local file — which Render (and most hosting platforms) wipes on every redeploy. Turso is a free, hosted SQLite-compatible database that lives independently of your hosting, so agents' listings, enquiries, and everything else survives updates permanently.

**One-time setup:**
1. Go to **turso.tech** → sign up for a free account.
2. Create a new database (the CLI or dashboard both work — their onboarding walks you through it).
3. Get two values: the **database URL** (starts with `libsql://...`) and an **auth token** (a long string starting with `eyJ...`).
4. Add both as environment variables — on Render, or in your local `.env` for development:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`

**Never commit these to GitHub** — they belong only in environment variables (Render's Environment tab, or a local `.env` file, which is already `.gitignore`d). Without them set, the app automatically falls back to a local file — fine for testing on your own computer, but never for the live site.

**How to verify it's actually working after deploying:** check your Render service's logs. If you see `No TURSO_DATABASE_URL set — using a local database file`, the environment variables didn't get picked up — double check they're saved under the correct service on Render. If that message is absent and the site loads normally, it's connected. As a stronger test: add a property as an agent, then trigger a new deploy (even a trivial one) — if the property is still there afterward, persistence is confirmed working.

## 16. Deploying to Render (get a real, permanent website link)

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
