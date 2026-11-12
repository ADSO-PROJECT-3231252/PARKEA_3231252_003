<div align="center">

# 🅿️ PARKEA

### *Smart Urban Parking Reservation System*

**ADSO 3231252 · Group 003 · SENA CDITI**

**[Project wiki](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/wiki)**: requirements, user stories, diagrams, API reference, data dictionary and more

</div>

---

## Table of Contents

- [Project Description](#project-description)
- [Development Team](#development-team)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Project Branches](#project-branches)
- [Installation and Setup](#installation-and-setup)
  - [Prerequisites](#prerequisites)
  - [Backend and Database](#backend-and-database)
  - [Frontend](#frontend-1)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Endpoints](#api-endpoints)
- [PARKEA Color Palette](#parkea-color-palette)
- [User Stories](#user-stories)
- [Code Conventions](#code-conventions)
- [Project Management and Status](#project-management-and-status)
- [License](#license)

---

## Project Description

**PARKEA** is an intelligent urban parking reservation system that allows users to:

- Create an account and confirm it from their email
- Explore available parking zones in their city, with their opening hours
- Reserve a spot in advance to guarantee their space
- Make simulated payments (no real money is charged)
- Manage their registered vehicles
- Administrators: manage zones and their opening hours, users, and view real-time metrics

The system is designed under a **MERN-like** architecture (React + Node.js + MySQL) with clear separation between frontend, backend, and persistence layer.

**Published site:** [https://parkea-web-sena-gcf8d5ggfcdncyam.chilecentral-01.azurewebsites.net](https://parkea-web-sena-gcf8d5ggfcdncyam.chilecentral-01.azurewebsites.net), hosted on Azure (see [docs/deployment.md](docs/deployment.md)). It runs on a free plan: after 20 minutes without visits the first page takes 30 to 60 seconds to load.

### Documented Scope (SRS)

> The system operates under a **mandatory reservation model**: a vehicle must have an active reservation to occupy a spot. Drive-in parking without a prior reservation is not supported. This is a documented limitation, not an omission.

---

## Development Team

| Name | Scrum role | GitHub | Branches |
|------|------------|--------|----------|
| **Michael Isaza** | Product Owner · Developer | [@MichaelIsaza](https://github.com/MichaelIsaza) | `isaza_backend`, `isaza_frontend` |
| **Jhoan Marín** | Scrum Master (Sprint 1) · Developer | [@jhoanmarin227](https://github.com/jhoanmarin227) | `marin_backend`, `marin_frontend` |
| **Stiven Sánchez** | Scrum Master (Sprint 4) · Developer | [@Stiven5-ctrl](https://github.com/Stiven5-ctrl) | `stiven_backend`, `stiven_frontend` |
| **David León** | Scrum Master (Sprint 2) · Developer | [@David-Leon1089](https://github.com/David-Leon1089) | `leon_backend`, `leon_frontend`, `leon_sql` |
| **Jhoan Almario** | Scrum Master (Sprint 3) · Developer | [@centinel117](https://github.com/centinel117) | `almario_backend`, `almario_frontend` |
| **Julián Quintero** | Developer | [@JulianQuintero-02](https://github.com/JulianQuintero-02) | `julian_backend`, `julian_frontend` |

> The Product Owner is the same for the whole project. The Scrum Master rotates every sprint.

---

## Tech Stack

Versions are the ranges declared in each `package.json`.

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React + React DOM | ^19.2.7 | UI library |
| Vite | ^8.1.1 | Bundler and dev server |
| Tailwind CSS (+ `@tailwindcss/vite`) | ^4.3.3 | Utility-first CSS, theme tokens via `@theme` |
| React Router DOM | ^7.18.1 | SPA routing |
| Axios | ^1.18.1 | HTTP client for the REST API |
| lucide-react | ^1.33.0 | Icons |
| Recharts | ^3.10.1 | Charts in the admin dashboard |
| Leaflet | ^1.9.4 | Interactive map (OpenStreetMap tiles) |
| React Leaflet | ^5.0.0 | React components for the zones map |
| Jest + React Testing Library | ^30.5.2 / ^16.3.3 | Frontend tests (dev dependencies) |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 24.15.0 | JavaScript runtime (version used by the team) |
| Express | ^5.2.1 | Web framework |
| Sequelize | ^6.37.8 | MySQL ORM |
| sequelize-cli | ^6.6.5 | Migrations and seeders (dev dependency) |
| mysql2 | ^3.23.1 | Database driver |
| jsonwebtoken | ^9.0.3 | Stateless authentication (JWT) |
| bcrypt | ^6.0.0 | Password hashing |
| express-validator | ^7.3.2 | Request validation |
| Helmet | ^8.3.0 | HTTP security headers |
| CORS | ^2.8.6 | Cross-origin policy |
| dotenv | ^17.4.2 | Loads the `.env` file |
| express-rate-limit | ^8.7.1 | Attempt limits on sign-in, sign-up, password recovery and the verification email |
| Nodemailer | ^10.1.7 | Verification and password recovery emails (Mailtrap on your computer, Resend on the published site) |
| UUID | ^14.0.1 | Unique identifiers |
| nodemon | ^3.1.14 | Auto-reload in development (dev dependency) |
| Jest + Supertest | ^30.5.2 / ^7.3.1 | Backend tests (dev dependencies) |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| MySQL | 8.0 or later (8.4 on Azure) | Relational database engine |

### Development Tools
| Tool | Use |
|------|-----|
| Git + GitHub | Version control, pull requests and the GitHub Projects board |
| Postman | Manual API testing |
| Azure (App Service + Azure Database for MySQL) | Hosting of the published site |
| Resend | Sending the emails of the published site |
| VS Code | Primary IDE |
| ESLint | JavaScript linter (frontend, ^10.6.0) |

---

## Repository Structure

```text
PARKEA_3231252_003/
│
├── 📁 backend/
│   ├── src/
│   │   ├── app.js            # Express config (middlewares, routes, error handler)
│   │   ├── server.js         # Entry point (checks the DB connection, starts the jobs, listens)
│   │   ├── 📁 assets/        # Logo that travels inside the emails
│   │   ├── 📁 config/        # Sequelize config (reads DATABASE_URL)
│   │   ├── 📁 constants/     # Centralized error codes (errorCodes.js)
│   │   ├── 📁 controllers/   # Business logic (one per module)
│   │   ├── 📁 jobs/          # Background jobs (reservation expiration and finalization)
│   │   ├── 📁 middlewares/   # Auth, attempt limits (rateLimit.js) and express-validator rules (*.validator.js)
│   │   ├── 📁 migrations/    # 26 Sequelize migrations: they create the database
│   │   ├── 📁 models/        # Sequelize models (11 tables)
│   │   ├── 📁 routes/        # API route definitions
│   │   ├── 📁 seeders/       # Demo data: roles, zones and the primary administrator
│   │   └── 📁 utils/         # Helpers (mailer and email layout, simulated payment, stay pricing, zone hours, validation)
│   ├── 📁 tests/             # Jest + Supertest tests (npm test)
│   ├── .env.example
│   ├── .sequelizerc          # Paths used by sequelize-cli
│   ├── API_REFERENCE.md      # Every endpoint with its rules and error codes
│   └── package.json
│
├── 📁 frontend/
│   ├── public/
│   ├── src/
│   │   ├── main.jsx          # React entry point
│   │   ├── App.jsx           # Router + AuthProvider
│   │   ├── index.css         # Tailwind CSS + PARKEA theme (design tokens via @theme)
│   │   ├── 📁 assets/        # Images, logos, illustrations
│   │   ├── 📁 components/    # Shared UI (Header, Footer, Layout, AuthCard, dialogs, FieldRow, MetricCard, ZoneMap, LocationPicker, ZoneFormFields, ZoneScheduleFields)
│   │   ├── 📁 context/       # Global state (AuthContext)
│   │   ├── 📁 hooks/         # Custom React hooks (useAuth, useZoneForm)
│   │   ├── 📁 pages/         # Route-based views
│   │   ├── 📁 routes/        # Route definitions and ProtectedRoute
│   │   ├── 📁 services/      # API calls (Axios)
│   │   ├── 📁 utils/         # Helpers: format, validators, error messages, statuses, open and extended stays, zone hours
│   │   └── config.js         # Address of the API (VITE_API_URL)
│   ├── 📁 tests/             # Jest + React Testing Library tests (npm test)
│   ├── .env.example
│   ├── babel.config.cjs      # Only used by Jest
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── 📁 database/
│   ├── schema.sql            # Readable reference of the database design (11 tables)
│   └── README.md
│
├── 📁 docs/
│   ├── deployment.md         # How the site is published on Azure, and the emails with Resend
│   └── README.md             # Index (technical manual and accessibility report to be added)
│
├── .editorconfig             # Shared editor settings (UTF-8, LF, final newline)
├── .mailmap                  # One name per author in the Git history
├── runProjectParkea.md       # Short step-by-step guide to run the project
└── README.md                 # ← This document
```

---

## Project Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable releases |
| `develop` | Integration of backend and frontend; README and `database/schema.sql` go here directly |
| `backend` | Integrated backend work |
| `frontend` | Integrated frontend work |
| `{name}_backend` / `{name}_frontend` | Each member's personal work (see the team table) |
| `leon_sql` | Original database design |
| Short-lived branches (e.g. `readme-update`) | Changes that go straight to `develop` |

**Workflow:** Simplified Git Flow. Each member works on their personal branch and opens a PR to their area branch (`backend` or `frontend`), which needs one approval from another member. The area branches are integrated into `develop` at the end of each sprint. Files not tied to one area (README, `database/schema.sql`) go to `develop` through their own PR. `develop` merges to `main` only for stable releases.

---

## Installation and Setup

The short version, step by step: [runProjectParkea.md](runProjectParkea.md).

### Prerequisites

- [Node.js](https://nodejs.org) — the team uses 24.15.0
- [MySQL](https://mysql.com) ≥ 8.0 (the service must be running)
- [Git](https://git-scm.com)

### Backend and Database

The database is created with the **Sequelize migrations and seeders**. `database/schema.sql` is only a readable reference of the same design: do not run it on the database you use with the migrations.

```bash
# 1. Clone the repository
git clone https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003.git
cd PARKEA_3231252_003/backend

# 2. Install dependencies
npm install

# 3. Create your .env from the example and fill it in (see Environment Variables)
cp .env.example .env
```

4. Create the empty database in MySQL:

```sql
CREATE DATABASE parkea_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

5. Create the tables and load the demo data (run inside `backend/`):

```bash
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
```

> The 26 migrations create the 11 tables: roles, users, vehicles, zones, zone_schedules, parking_spots, reservations, payments, password_reset_tokens, email_verification_tokens and admin_action_logs.
> The seeders add the `admin` and `user` roles, 4 demo zones open 24 hours with their parking spots, and the primary administrator `admin@parkea.com`, already verified (its password is set in `src/seeders/20260808234824-demo-primary-admin.js`).
> A new account must confirm its email before signing in. On your computer the email arrives in your Mailtrap inbox, so fill in the `MAILTRAP_*` variables (see Environment Variables).

6. Start the development server:

```bash
npm run dev

# Server running at: http://localhost:3000
# Health check:      http://localhost:3000/api/health → {"status":"ok","service":"PARKEA API"}
```

> If the server stops with `ECONNREFUSED`, the MySQL service is not running.

### Frontend

```bash
# 1. Navigate to frontend
cd ../frontend

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Start development server
npm run dev

# App running at: http://localhost:5173
```

> After every `git pull` that brings frontend changes, run `npm ci` so any new library gets installed.

---

## Environment Variables

Never commit a `.env` file: only `.env.example` goes to the repository.

### Backend (`backend/.env`)

```env
# Server
PORT=3000
NODE_ENV=development

# Database (the only database setting the code reads)
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/parkea_db

# JWT
JWT_SECRET=change_this_to_a_long_random_secret
JWT_EXPIRES_IN=1h

# CORS: address of the frontend
FRONTEND_URL=http://localhost:5173

# Emails (verification and password recovery): Mailtrap on your computer
MAIL_FROM=
MAILTRAP_HOST=sandbox.smtp.mailtrap.io
MAILTRAP_PORT=2525
MAILTRAP_USER=your_mailtrap_user
MAILTRAP_PASS=your_mailtrap_password
```

| Variable | Used for |
|----------|----------|
| `PORT` | Port of the API (default 3000) |
| `NODE_ENV` | Sequelize environment (default `development`) |
| `DATABASE_URL` | MySQL connection, used by the server and by sequelize-cli |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Signing and lifetime of the session token (default 1h) |
| `FRONTEND_URL` | Origin allowed by CORS, and address of the links in the emails (default `http://localhost:5173`) |
| `MAILTRAP_*` | SMTP account for the verification and password recovery emails. On your computer, the Mailtrap sandbox: without it a new account cannot be confirmed. The published site uses Resend with the same names (see [docs/deployment.md](docs/deployment.md)) |
| `MAIL_FROM` | Sender of the emails. Leave it empty on your computer; the published site uses `no-reply@parkeaweb.me` |

> If the MySQL password has special characters, encode them in `DATABASE_URL` (for example `$` → `%24`, `@` → `%40`).

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000/api
```

---

## Available Scripts

### Backend
| Script | Command | Description |
|--------|---------|-------------|
| Development | `npm run dev` | nodemon + auto-reload |
| Production | `npm start` | Plain Node |
| Tests | `npm test` | Jest + Supertest, no MySQL needed |

### Database (run inside `backend/`)
| Task | Command |
|------|---------|
| Create the database | `npm run db:create` |
| Create or update the tables | `npm run db:migrate` |
| Load the demo data (only once) | `npm run db:seed` |
| Start over: delete the database and build it again (local only) | `npm run db:reset` |
| Undo the last migration | `npx sequelize-cli db:migrate:undo` |
| Remove the demo data | `npx sequelize-cli db:seed:undo:all` |

### Frontend
| Script | Command | Description |
|--------|---------|-------------|
| Development | `npm run dev` | Vite dev server |
| Build | `npm run build` | Production build |
| Preview | `npm run preview` | Build preview |
| Lint | `npm run lint` | ESLint |
| Tests | `npm test` | Jest + React Testing Library, no backend needed |

---

## API Endpoints

Base URL: `http://localhost:3000/api`. **Public**: no token. **User**: any signed-in account. **Admin**: administrator role only. Protected routes expect the header `Authorization: Bearer <token>`; a token stops working when the password of its account changes.

| Module | Method and route | Access | Story |
|--------|------------------|--------|-------|
| Health | `GET /health` | Public | — |
| Auth | `POST /auth/register` (the account is created as not verified) | Public | HU-01, HU-30 |
| Auth | `POST /auth/login` | Public | HU-05, HU-30 |
| Auth | `POST /auth/login-admin` | Public | HU-06, HU-30 |
| Auth | `POST /auth/verify-email`, `POST /auth/resend-verification` | Public | HU-30 |
| Auth | `POST /auth/forgot-password`, `POST /auth/reset-password` | Public | HU-07 |
| Profile | `GET /users/me`, `PUT /users/me`, `PUT /users/me/password` | User | HU-08 |
| Vehicles | `POST /vehicles`, `GET /vehicles`, `GET /vehicles/:id` | User | HU-10, HU-11 |
| Vehicles | `PUT /vehicles/:id`, `PATCH /vehicles/:id/default` | User | HU-11, HU-12 |
| Vehicles | `DELETE /vehicles/:id` (soft delete) | User | HU-13 |
| Zones | `GET /zones`, `GET /zones/:id` (with the opening hours) | Public | HU-09, HU-29 |
| Zones | `GET /zones/all`, `GET /zones/:id/spots` | Admin | HU-19 |
| Zones | `POST /zones`, `PUT /zones/:id` (with the opening hours) | Admin | HU-20, HU-21, HU-29 |
| Zones | `PATCH /zones/:id/toggle` | Admin | HU-19 |
| Reservations | `POST /reservations` (inside the opening hours; with `openEnded: true` for a stay without an exit time) | User | HU-14, HU-27, HU-29 |
| Reservations | `GET /reservations` (paginated), `GET /reservations/:id` | User | HU-15, HU-18 |
| Reservations | `PATCH /reservations/:id/cancel` | User | HU-16 |
| Reservations | `PATCH /reservations/:id/finish` (finish an open stay) | User | HU-27 |
| Reservations | `PATCH /reservations/:id/extend` (extend a stay or switch it to an open stay, up to the closing time) | User | HU-28, HU-29 |
| Payments | `POST /payments/:reservationId` | User | HU-17 |
| Payments | `POST /payments/:reservationId/balance` (balance of an open stay) | User | HU-27 |
| Dashboard | `GET /admin/dashboard` and `/admin/dashboard/{occupancy, payments-status, recent-payments, reservations-by-zone, alerts}` | Admin | HU-22 |
| Users | `GET /admin/users`, `GET /admin/users/logs` | Admin | HU-23 |
| Users | `PATCH /admin/users/:id/role`, `PATCH /admin/users/:id/status` | Admin | HU-23 |

Business errors come back as `{ "code": "...", "message": "..." }`. Validation errors come back as `{ "code": "VALIDATION_ERROR", "errors": [...] }`, without `message`: each item of `errors` names the field (`path`) and its message (`msg`), and an item about one day of the opening hours also has its `day`. The errors of a reservation outside the opening hours (`OUTSIDE_ZONE_HOURS`, `ZONE_CLOSED_THAT_DAY`) also bring `hours`, the hours of that day. A route that does not exist returns 404 `ROUTE_NOT_FOUND`. Sign-in, sign-up, password recovery and the verification email have attempt limits and answer 429 `TOO_MANY_REQUESTS` when one is reached. The codes are listed in `backend/src/constants/errorCodes.js`, and the frontend shows them in Spanish with `translateError(code)`. Every endpoint, with its rules, its errors and the attempt limits, is described in [backend/API_REFERENCE.md](backend/API_REFERENCE.md).

---

## PARKEA Color Palette

Colors are defined in `frontend/src/index.css` as Tailwind v4 custom CSS variables.

### Primary Green
| Token | Hex | Use |
|-------|-----|-----|
| `parkea-50` | `#ECF7F1` | Soft backgrounds |
| `parkea-100` | `#D0EADD` | Subtle borders |
| `parkea-200` | `#A5D6BF` | Soft hover |
| `parkea-300` | `#6FBD9B` | Focus rings |
| `parkea-400` | `#3F9E75` | Medium emphasis |
| `parkea-500` | `#2A8560` | Secondary buttons |
| `parkea-600` | `#1F6B4D` | **Primary buttons, links** |
| `parkea-700` | `#17503A` | Active hover |
| `parkea-800` | `#103728` | Dark text |
| `parkea-900` | `#0A2318` | Headings |

### Semantic
| Token | Hex | Use |
|-------|-----|-----|
| `warning` | `#8A5A0E` | Warnings |
| `warning-soft` | `#FDF3E2` | Warning background |
| `danger` | `#B3261E` | **Errors** |
| `danger-soft` | `#FBEBEA` | Error background |
| `info` | `#1B5FA8` | Information |
| `info-soft` | `#EAF1FA` | Info background |

### Neutrals
| Token | Hex | Use |
|-------|-----|-----|
| `neutral-50` | `#F6F8F7` | **Page background** |
| `neutral-100` | `#EDEFEE` | Secondary cards |
| `neutral-200` | `#DCE0DE` | **Input borders** |
| `neutral-300` | `#BFC5C2` | Dividers |
| `neutral-400` | `#949B98` | Placeholders |
| `neutral-500` | `#6E7572` | Decorative icons/placeholders only — fails text contrast |
| `neutral-600` | `#545B58` | Secondary text, labels |
| `neutral-700` | `#3D4441` | Primary text |
| `neutral-800` | `#272C2A` | Headings |
| `neutral-900` | `#161A18` | Maximum contrast text |

### Other Colors
| Token | Hex | Use |
|-------|-----|-----|
| `gold-500` | `#F5C518` | Default vehicle star |
| `flag-yellow` | `#FCD116` | Colombian plate stripe |
| `flag-blue` | `#003893` | Colombian plate stripe |
| `flag-red` | `#CE1126` | Colombian plate stripe |

> A color that is not in this palette is added as a new token in `@theme`, never as a loose value.

### Typography
| Token | Family | Use |
|-------|--------|-----|
| `font-display` | Barlow Condensed | Headings |
| `font-sans` | Barlow | Body text |
| `font-mono` | IBM Plex Mono | Code, IDs, plates, amounts |

| Text size | Size | Use |
|-----------|------|-----|
| `text-display` | 34px / 600 | Page titles |
| `text-title` | 24px / 600 | Section titles |
| `text-subtitle` | 18px / 600 | Subtitles |
| `text-body` | 15px / 400 | Body text |
| `text-label` | 13.5px / 500 | Labels and buttons |
| `text-caption` | 12.5px / 400 | Helper text |

Radii: `rounded-sm` 6px, `rounded-md` 10px, `rounded-lg` 12px. Spacing uses multiples of 4.

---

## User Stories

Each user story is an issue with its acceptance criteria, traceability and Definition of Done. Its current status and its pull requests are on the issue and on the **PARKEA - Sprint Board** (Projects tab of the repository).

| ID | Story | Responsible | Issue |
|----|-------|-------------|-------|
| HU-01 | User Registration | @jhoanmarin227 | [#136](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/136) |
| HU-02 | View the PARKEA Homepage (Public) | @MichaelIsaza | [#137](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/137) |
| HU-03 | Homepage — Authenticated User | @MichaelIsaza | [#138](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/138) |
| HU-04 | Homepage — Administrator | @MichaelIsaza | [#139](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/139) |
| HU-05 | User Login | @jhoanmarin227 | [#140](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/140) |
| HU-06 | Administrator Login | @jhoanmarin227 | [#141](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/141) |
| HU-07 | Password Recovery | @jhoanmarin227 | [#142](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/142) |
| HU-08 | User Profile Management | @jhoanmarin227 | [#143](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/143) |
| HU-09 | Browse Available Zones | @jhoanmarin227 | [#144](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/144) |
| HU-10 | Register Vehicle | @MichaelIsaza | [#145](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/145) |
| HU-11 | View My Registered Vehicles | @MichaelIsaza | [#146](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/146) |
| HU-12 | Edit Vehicle Information | @centinel117 | [#147](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/147) |
| HU-13 | Delete a Vehicle | @centinel117 | [#148](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/148) |
| HU-14 | Reserve a Spot | @MichaelIsaza | [#149](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/149) |
| HU-15 | View Reservation Confirmation | @MichaelIsaza | [#150](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/150) |
| HU-16 | Cancel a Reservation | @jhoanmarin227 | [#151](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/151) |
| HU-17 | Simulated Payment | @centinel117 | [#152](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/152) |
| HU-18 | View Booking History | @Stiven5-ctrl | [#153](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/153) |
| HU-19 | Parking Zone Management | @Stiven5-ctrl | [#154](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/154) |
| HU-20 | Create Parking Zone | @Stiven5-ctrl | [#155](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/155) |
| HU-21 | Edit Parking Zone | @Stiven5-ctrl | [#156](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/156) |
| HU-22 | Administrative Dashboard | @David-Leon1089 | [#157](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/157) |
| HU-23 | User Management | @David-Leon1089 | [#158](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/158) |
| HU-24 | Sign Out | @MichaelIsaza | [#159](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/159) |
| HU-25 | View Zones on Map | @jhoanmarin227 | [#160](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/160) |
| HU-26 | Reservation Expiration | @MichaelIsaza | [#161](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/161) |
| HU-27 | Open-Ended Stay | @jhoanmarin227 | [#225](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/225) |
| HU-28 | Extend Stay | @jhoanmarin227 | [#226](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/226) |
| HU-29 | Parking Zone Opening Hours | @MichaelIsaza | [#242](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/242) |
| HU-30 | Email Verification | @jhoanmarin227 | [#265](https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003/issues/265) |

---

## Code Conventions

### Backend
- **Naming language (official team decision):** domain/business names — files, models, and controller functions that represent a business entity or action (e.g. `Usuario`, `Zona`, `vehiculo.controller.js`, `cambiarRol`) — stay in **Spanish**, since they reflect the data model vocabulary already defined in the SRS. Everything else (internal variable names, code comments, log/error messages) is in **English**.
- **Errors:** business errors are `{ code, message }` and validation errors are `{ code: VALIDATION_ERROR, errors }`; the codes are English uppercase with underscores in `constants/errorCodes.js`
- **Models:** PascalCase singular (e.g., `Usuario`, `Vehiculo`)
- **Tables:** Plural snake_case in DB (e.g., `users`, `parking_spots`)
- **Database changes:** always through a new migration in `src/migrations`
- **Deleted records:** soft delete (`deleted_at`), never removed from the database
- **Controllers:** async/await with try/catch
- **Validation:** express-validator rules in separate `*.validator.js` files inside `middlewares/`

### Frontend
- **Language:** Spanish for UI text, English for code and code comments
- **Routes (official team decision):** English (e.g. `/login`, `/forgot-password`, `/admin/login`)
- **Error messages:** always `translateError(code)` from `utils/errorMessages.js`; never compare or show the backend `message`
- **Icons:** lucide-react with Tailwind classes (`className="h-4 w-4"`), never the `size`/`color` props; decorative icons get `aria-hidden="true"`
- **Colors:** only the theme tokens; secondary text uses `neutral-600` (`neutral-500` fails contrast)
- **Shared code:** reuse `utils/` (format, validators) and `components/` (ConfirmDialog, FieldRow) instead of copying them
- **Accessibility:** WCAG 2.1 AA — keyboard access, visible focus, and status messages announced to screen readers
- **Components:** PascalCase (e.g., `Login.jsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useAuth`)
- **Services:** camelCase (e.g., `authService.js`)
- **Styles:** Tailwind CSS utilities, PARKEA theme in `index.css`

### Git
- **Branches:** one per member and area: `{name}_backend`, `{name}_frontend`
- **Commits:** in English, small (one step or file each), with a prefix: `feat:`, `fix:`, `refactor:` or `docs:`
- **Pull requests:** title and description in English, to the area branch (`backend`/`frontend`), approved by another member before merging
- **Linking:** each PR is linked to its issue from the **Development** panel and says `Part of #<issue>` (`Closes` does not work because PRs do not target `main`)

---

## Project Management and Status

### Scrum on GitHub Projects

The work is managed with Scrum on the **PARKEA - Sprint Board** (Projects tab of the repository):

- **Columns:** Backlog → To Do → In Progress → In Review (PR) → Done
- **Item types:** User Story, Technical Task and Audit Finding, with Sprint, Priority (Must / Should / Could) and Points
- **Definition of Done:** meets the acceptance criteria · PR reviewed and approved by another member · validates input and handles errors · no credentials in the repository · README updated

### Sprints and Key Dates

| Period | Dates | Notes |
|--------|-------|-------|
| Sprint 1 | Oct 13 – Oct 26, 2026 | Sprint review on Oct 27, version `v0.1` |
| Sprint 2 | Oct 27 – Nov 9, 2026 | Audit 2 on Nov 10, version `v0.2` |
| Sprint 3 | Nov 10 – Nov 23, 2026 | |
| Feature freeze | Nov 24, 2026 | From this date only fixes: no new views or features |
| Final demo | Dec 1, 2026 | Demo and individual presentation |

**Sprint 1 goal:** finish the reservation confirmation, the simulated payment, zone management and creation, user management and the zones map, and close the pending fixes of the stories already delivered.

**Sprint 2 goal:** let users cancel a reservation, see their booking history, park without a chosen exit time and extend a stay (HU-16, HU-18, HU-27 and HU-28), and make the system more reliable with stronger validations and error handling, attempt limits, safe handling of simultaneous requests, real recovery emails and the first frontend tests.

### Technical Work Status

| Task | Priority | Status |
|------|----------|--------|
| Integrate `backend` and `frontend` into `develop` | High | Done at the end of every sprint: `v0.1` (Sprint 1) and `v0.2` (Sprint 2) |
| Automated testing (unit + integration) | High | In progress: Jest + Supertest in the backend since Sprint 1 and Jest + React Testing Library in the frontend since Sprint 2. At the end of Sprint 2: 105 backend tests and 77 frontend tests |
| Server/cloud deployment | Low | Done: published on Azure (App Service + Azure Database for MySQL), see [docs/deployment.md](docs/deployment.md). It runs `integration/sprint-2` |
| Performance measurement | Medium | SRS requires < 3s with 50 concurrent users. Not against the published site: its free plan has 60 CPU minutes a day |
| API documentation (Swagger/OpenAPI) | Medium | Today the reference is the endpoint table above and [backend/API_REFERENCE.md](backend/API_REFERENCE.md) |

---

## License

This project is developed for educational purposes within the **Software Analysis and Development (ADSO)** program at **SENA**.

© 2026 — ADSO 3231252 · Group 003

---

<div align="center">

**[⬆ Back to top](#table-of-contents)**

</div>
