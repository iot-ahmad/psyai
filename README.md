# PsyAI — Mental Health Platform

A full-stack mental health platform providing individual therapy sessions, psychological assessments, and corporate wellness programs.

---

## Project Structure

```
psyai/
├── frontend/               ← All client-side code (HTML, CSS, JS, images, fonts)
│   ├── index.html          ← Landing page
│   ├── login.html          ← Authentication (register / login / OTP)
│   ├── specialists.html    ← Browse specialists
│   ├── specialist.html     ← Specialist portal
│   ├── assessment.html     ← Psychological assessment
│   ├── blog.html           ← Articles list
│   ├── article.html        ← Single article view
│   ├── profile.html        ← User profile & account settings
│   ├── session.html        ← Active therapy session
│   ├── business.html       ← B2B / corporate landing page
│   ├── service-*.html      ← Service detail pages
│   ├── values.html         ← Company values page
│   ├── style.css           ← Main stylesheet
│   ├── script.js           ← Main frontend script
│   ├── articles-store.js   ← Article data store
│   ├── package.json        ← Frontend dev server + test runner
│   ├── _redirects          ← Netlify URL redirect rules
│   ├── assets/
│   │   ├── css/            ← Page-specific stylesheets (login, profile, fonts)
│   │   ├── js/             ← ES module JS (auth, api, ui, i18n, config, profile)
│   │   ├── fonts/          ← Montserrat Arabic font files
│   │   └── images/         ← All project images
│   └── tests/
│       └── auth.test.mjs   ← Frontend unit tests (auth.js, ui.js)
│
├── backend/                ← All server-side code (Express API, Prisma ORM)
│   ├── package.json        ← Backend dependencies
│   ├── jest.config.js      ← Jest test configuration
│   ├── .env                ← Environment variables (DO NOT COMMIT)
│   ├── src/
│   │   ├── index.js        ← Express server entry point + route definitions
│   │   ├── config/
│   │   │   └── db.js       ← PrismaClient singleton
│   │   ├── controllers/    ← Request handlers (auth, specialists, bookings, payments, admin, b2b)
│   │   ├── middlewares/    ← JWT auth, Helmet/CORS security, Zod validation
│   │   ├── services/       ← Business logic (WhatsApp OTP, payments, audit, security)
│   │   └── routes/         ← (routes are defined inline in index.js)
│   ├── prisma/
│   │   ├── schema.prisma   ← Database schema (SQLite, 10 models)
│   │   ├── dev.db          ← SQLite database file (local dev only, gitignored)
│   │   └── seed.js         ← Seed script (admin user + sample specialists)
│   └── tests/              ← Backend unit tests (Jest, mocked Prisma)
│
├── docs/                   ← Documentation
│   ├── registration.md
│   └── security-rules.md
│
├── .gitignore
├── netlify.toml            ← Netlify deployment config (publish = "frontend")
└── README.md               ← This file
```

---

## Running the Frontend

The frontend is a static site (no build step required).

```bash
cd frontend
npm run dev
# → Serves at http://localhost:3000
```

Or open any HTML file directly in a browser (some features require the backend to be running).

**Run frontend tests:**
```bash
cd frontend
npm test
```

---

## Running the Backend

```bash
cd backend
npm install          # First time only
npm run dev          # Development mode (auto-restarts on changes)
# → API server at http://localhost:5000
# → Health check: http://localhost:5000/api/health
```

**Run backend tests:**
```bash
cd backend
npm test             # Run all unit tests
npm run test:coverage  # With coverage report
```

---

## Database Setup (Prisma + SQLite)

The database is managed with [Prisma ORM](https://www.prisma.io/) using SQLite for local development.

### First-time setup

```bash
cd backend

# 1. Copy environment file and fill in values
cp .env.example .env   # (or create .env manually — see Environment Variables below)

# 2. Generate Prisma client
npm run prisma:generate

# 3. Push schema to the database (creates dev.db)
npm run prisma:push

# 4. Seed initial data (admin user + sample specialists)
npm run prisma:seed
```

### Schema changes

After modifying `backend/prisma/schema.prisma`:
```bash
cd backend
npm run prisma:push     # Apply changes to dev.db
npm run prisma:generate # Regenerate the Prisma client
```

---

## Environment Variables

Create a `.env` file inside the `backend/` folder. **Never commit real values.**

| Variable | Description |
|----------|-------------|
| `PORT` | Port the Express server listens on (default: `5000`) |
| `DATABASE_URL` | Prisma database connection string (e.g. `file:./prisma/dev.db`) |
| `JWT_SECRET` | Secret key for signing JWT tokens (use a long random string) |
| `JWT_EXPIRES_IN` | JWT token expiry (e.g. `7d`) |
| `WHATSAPP_PROVIDER` | OTP provider: `simulator` \| `meta` \| `twilio` |
| `WHATSAPP_API_TOKEN` | WhatsApp API token (if using Meta or Twilio) |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Phone Number ID (Meta Cloud API) |
| `WHATSAPP_TEMPLATE_NAME` | WhatsApp message template name |
| `PAYMENT_GATEWAY` | Payment provider: `simulator` \| `visa` \| `stripe` \| `moyasar` |
| `PAYMENT_SECRET_KEY` | Payment gateway secret key |
| `PAYMENT_WEBHOOK_SECRET` | Webhook verification secret |
| `VISA_WEBHOOK_SECRET` | Visa webhook signature secret |
| `VISA_HOSTED_CHECKOUT_URL` | Visa hosted checkout endpoint URL |
| `VISA_API_KEY` | Visa API key |
| `VISA_MERCHANT_ID` | Visa merchant identifier |
| `VISA_SHARED_SECRET` | Visa shared secret for HMAC signing |
| `ADMIN_SECRET_KEY` | Secret key for seeding the initial admin account |

---

## API Overview

The backend exposes a REST API at `http://localhost:5000`:

| Prefix | Description |
|--------|-------------|
| `GET /api/health` | Health check |
| `POST /api/auth/*` | Registration, login, OTP, password reset, Google auth |
| `GET/PUT /api/user/*` | User profile & account management |
| `GET /api/specialists` | List / get specialists |
| `POST/GET /api/bookings` | Create & manage bookings |
| `POST/GET /api/payments` | Visa payment sessions & webhook |
| `GET/POST /api/admin/*` | Admin panel (users, specialists, bookings, services) |
| `GET/POST /api/specialist/*` | Specialist portal (profile, bookings, articles) |
| `GET /api/articles` | Public articles |
| `POST/GET /api/b2b-requests` | Corporate partnership requests |

---

## Deployment (Netlify — Frontend)

The frontend deploys automatically via Netlify:

- **Publish directory:** `frontend/`
- **Build command:** *(none — static site)*
- **Redirects:** Configured in `frontend/_redirects` and `netlify.toml`

The backend must be deployed separately on a Node.js-capable host (e.g. Railway, Render, VPS).

After deploying the backend, update `API_BASE` in `frontend/assets/js/config.js` or override it at runtime via `localStorage.setItem('psyai_api_url', 'https://your-backend-url.com')`.
