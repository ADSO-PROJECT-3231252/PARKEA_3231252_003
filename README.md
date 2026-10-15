<div align="center">

# PARKEA

### *Smart Urban Parking Reservation System*

**ADSO 3231252 · Group 003 · SENA CDITI**

</div>

---

## Table of Contents

- [ Project Description](#-project-description)
- [ Development Team](#-development-team)
- [ Tech Stack](#️-tech-stack)
- [ Repository Structure](#-repository-structure)
- [ Project Branches](#-project-branches)
- [ Installation and Setup](#-installation-and-setup)
  - [Prerequisites](#prerequisites)
  - [Backend and Database](#backend-and-database)
  - [Frontend](#frontend-1)
- [ Environment Variables](#️-environment-variables)
- [ Available Scripts](#-available-scripts)
- [ PARKEA Color Palette](#-parkea-color-palette)
- [ User Stories](#-user-stories)
- [ Code Conventions](#-code-conventions)
- [ Current Project Status](#-current-project-status)
- [ License](#-license-1)

---

## Project Description

**PARKEA** is an intelligent urban parking reservation system that allows users to:

-  Explore available parking zones in their city
-  Reserve a spot in advance to guarantee their space
-  Make secure simulated payments
-  Manage their registered vehicles
-  Administrators: manage zones, users, and view real-time metrics

The system is designed under a **MERN-like** architecture (React + Node.js + MySQL) with clear separation between frontend, backend, and persistence layer.

### Documented Scope (SRS)

> The system operates under a **mandatory reservation model**: a vehicle must have an active reservation to occupy a spot. Drive-in parking without a prior reservation is not supported. This is a documented limitation, not an omission.

---

## Development Team

| Name | Role | GitHub | Main Branch |
|------|------|--------|-------------|
| **Michael Isaza** | Scrum Master / Tech Lead | [@MichaelIsaza](https://github.com/MichaelIsaza) | `isaza_backend`, `isaza_frontend` |
| **Jhoan Marín** | Full Stack Developer | [@jhoanmarin227](https://github.com/jhoanmarin227) | `marin_backend`, `marin_frontend` |
| **Stiven Sánchez** | Backend Developer | [@Stiven5-ctrl](https://github.com/Stiven5-ctrl) | `stiven_backend` |
| **David León** | Frontend Developer / DBA | [@David-Leon1089](https://github.com/David-Leon1089) | `leon_backend`, `leon_sql` |
| **Jhoan Almario** | Analyst / Backend | [@centinel117](https://github.com/centinel117) | `almario_backend`, `almario_frontend` |

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
| Nodemailer | ^9.0.5 | Password recovery emails (Mailtrap) |
| UUID | ^14.0.1 | Unique identifiers |
| nodemon | ^3.1.14 | Auto-reload in development (dev dependency) |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| MySQL | 8.0 | Relational database engine |

### Development Tools
| Tool | Use |
|------|-----|
| Git + GitHub | Version control, pull requests and the GitHub Projects board |
| Postman | Manual API testing |
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
│   │   ├── 📁 config/        # Sequelize config (reads DATABASE_URL)
│   │   ├── 📁 constants/     # Centralized error codes (errorCodes.js)
│   │   ├── 📁 controllers/   # Business logic (one per module)
│   │   ├── 📁 jobs/          # Background jobs (reservation expiration and finalization)
│   │   ├── 📁 middlewares/   # Auth and express-validator rules (*.validator.js)
│   │   ├── 📁 migrations/    # 19 Sequelize migrations: they create the database
│   │   ├── 📁 models/        # Sequelize models (9 tables)
│   │   ├── 📁 routes/        # API route definitions
│   │   ├── 📁 seeders/       # Demo data: roles, zones and the primary administrator
│   │   └── 📁 utils/         # Helpers (mailer)
│   ├── .env.example
│   ├── .sequelizerc          # Paths used by sequelize-cli
│   └── package.json
│
├── 📁 frontend/
│   ├── public/
│   ├── src/
│   │   ├── main.jsx          # React entry point
│   │   ├── App.jsx           # Router + AuthProvider
│   │   ├── index.css         # Tailwind CSS + PARKEA theme (design tokens via @theme)
│   │   ├── 📁 assets/        # Images, logos, illustrations
│   │   ├── 📁 components/    # Shared UI (Header, Layout, ConfirmDialog, FieldRow, MetricCard)
│   │   ├── 📁 context/       # Global state (AuthContext)
│   │   ├── 📁 hooks/         # Custom React hooks (useAuth)
│   │   ├── 📁 pages/         # Route-based views
│   │   ├── 📁 routes/        # Route definitions and ProtectedRoute
│   │   ├── 📁 services/      # API calls (Axios)
│   │   └── 📁 utils/         # Helpers: format, validators, error messages, statuses
│   ├── .env.example
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── 📁 database/
│   ├── schema.sql            # Readable reference of the database design (9 tables)
│   └── README.md
│
├── 📁 docs/
│   └── README.md             # Technical manual and accessibility report (to be added)
│
└── README.md                 # ← This document
```

---

## Project Branches

| Branch | Purpose | Members | Status |
|--------|---------|---------|--------|
| `main` | Stable production code | — | ⚪ Initial README only |
| `develop` | Continuous integration | Michael (merge) | 🟢 Active |
| `backend` | Consolidated backend dev | Michael | 🟢 Most advanced |
| `frontend` | Consolidated frontend dev | Various | 🟡 In progress |
| `isaza_backend` | Michael's individual work | @MichaelIsaza | 🟢 Active |
| `isaza_frontend` | Michael's individual work | @MichaelIsaza | 🟡 Active |
| `stiven_backend` | Stiven's individual work | @Stiven5-ctrl | 🟢 Active |
| `marin_backend` | Jhoan M.'s individual work | @jhoanmarin227 | 🟢 Active |
| `marin_frontend` | Jhoan M.'s individual work | @jhoanmarin227 | 🟡 Active |
| `leon_backend` | David's individual work | @David-Leon1089 | 🟢 Active |
| `leon_sql` | Database design | @David-Leon1089 | ✅ Complete |
| `almario_backend` | Almario's individual work | @centinel117 | 🟢 Active |
| `almario_frontend` | Almario's individual work | @centinel117 | 🔴 Inactive |

**Workflow:** Simplified Git Flow. Each member works on their personal branch, makes PR to their area branch (`backend` or `frontend`), and those merge to `develop`. Files not tied to one area (README, `database/schema.sql`) PR directly to `develop`. `develop` merges to `main` only on stable releases.

---

## Installation and Setup

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

> The 19 migrations create the 9 tables: roles, users, vehicles, zones, parking_spots, reservations, payments, password_reset_tokens and admin_action_logs.
> The seeders add the `admin` and `user` roles, 4 demo zones with their parking spots, and the primary administrator `admin@parkea.com` (its password is set in `src/seeders/20260808234824-demo-primary-admin.js`).

6. Start the development server:

```bash
npm run dev

# Server running at: http://localhost:3000
# Health check:      http://localhost:3000/api/health → {"status":"ok"}
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

# Mailtrap (password recovery emails)
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
| `FRONTEND_URL` | Origin allowed by CORS (default `http://localhost:5173`) |
| `MAILTRAP_*` | SMTP account for the password recovery emails |

> If the MySQL password has special characters, encode them in `DATABASE_URL` (for example `$` → `%24`, `@` → `%40`).
> `.env.example` also lists `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD`, but the code does not read them.

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

### Database (run inside `backend/`)
| Task | Command |
|------|---------|
| Create or update the tables | `npx sequelize-cli db:migrate` |
| Undo the last migration | `npx sequelize-cli db:migrate:undo` |
| Load the demo data | `npx sequelize-cli db:seed:all` |
| Remove the demo data | `npx sequelize-cli db:seed:undo:all` |

### Frontend
| Script | Command | Description |
|--------|---------|-------------|
| Development | `npm run dev` | Vite dev server |
| Build | `npm run build` | Production build |
| Preview | `npm run preview` | Build preview |
| Lint | `npm run lint` | ESLint |

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

### Typography
| Token | Family | Use |
|-------|--------|-----|
| `font-display` | Barlow Condensed | Headings |
| `font-sans` | Barlow | Body text |
| `font-mono` | IBM Plex Mono | Code, IDs, plates, amounts |

---

## User Stories

| ID | Name | Author | Backend | Frontend |
|----|------|--------|---------|----------|
| HU-01 | User Registration | @Stiven5-ctrl | ✅ | ✅ |
| HU-02 | Public Homepage | @Stiven5-ctrl | N/A | 🟡 |
| HU-03 | Authenticated Homepage | @Stiven5-ctrl | N/A | 🟡 |
| HU-04 | Administrator Homepage | @Stiven5-ctrl | N/A | 🔴 |
| HU-05 | User Login | @centinel117 | ✅ | ✅ |
| HU-06 | Administrator Login | @centinel117 | ✅ | 🔴 |
| HU-07 | Password Recovery | @centinel117 | ✅ | 🔴 |
| HU-08 | Profile Management | @jhoanmarin227 | ✅ | 🟡 |
| HU-09 | Browse Available Zones | @jhoanmarin227 | ✅ | 🟡 |
| HU-10 | Register Vehicle | @MichaelIsaza | ✅ | 🔴 |
| HU-11 | View My Vehicles | @MichaelIsaza | ✅ | 🔴 |
| HU-12 | Edit Vehicle | @MichaelIsaza | ✅ | 🔴 |
| HU-13 | Delete Vehicle | @MichaelIsaza | ✅ | 🔴 |
| HU-14 | Reserve a Spot | @MichaelIsaza | ✅ | 🔴 |
| HU-15 | Reservation Confirmation | @MichaelIsaza | ✅ | 🔴 |
| HU-16 | Cancel Reservation | @jhoanmarin227 | ✅ | 🔴 |
| HU-17 | Simulated Payment | @centinel117 | ✅ | 🔴 |
| HU-18 | Booking History | @Stiven5-ctrl | ✅ | 🔴 |
| HU-19 | Zone Management (admin) | @Stiven5-ctrl | ✅ | 🔴 |
| HU-20 | Create Zone | @Stiven5-ctrl | ✅ | 🔴 |
| HU-21 | Edit Zone | @Stiven5-ctrl | ✅ | 🔴 |
| HU-22 | Admin Dashboard | @David-Leon1089 | ✅ | 🔴 |
| HU-23 | User Management (admin) | @David-Leon1089 | ✅ | 🔴 |
| HU-24 | Sign Out | @centinel117 | N/A | 🟡 |
| HU-25 | View Zones on Map | @jhoanmarin227 | N/A | 🔴 |
| HU-26 | Reservation Expiration | @MichaelIsaza | ✅ | N/A |

**Legend:**
- ✅ Implemented and verified
- 🟡 In development / partial
- 🔴 Not started
- N/A Not applicable (automatic process, client-side only, or backend-only)

---

## Code Conventions

### Backend
- **Naming language (official team decision):** domain/business names — files, models, and controller functions that represent a business entity or action (e.g. `Usuario`, `Zona`, `vehiculo.controller.js`, `cambiarRol`) — stay in **Spanish**, since they reflect the data model vocabulary already defined in the SRS. Everything else (internal variable names, code comments, log/error messages) is in **English**.
- **Error codes:** English uppercase with underscores in `constants/errorCodes.js`
- **Models:** PascalCase singular (e.g., `Usuario`, `Vehiculo`)
- **Tables:** Plural snake_case in DB (e.g., `users`, `parking_spots`)
- **Controllers:** async/await with try/catch, errors passed to `next(error)`
- **Validation:** express-validator rules in separate `*.validator.js` files inside `middlewares/`

### Frontend
- **Language:** Spanish for UI text, English for code
- **Routes (official team decision):** English (e.g. `/login`, `/forgot-password`, `/admin/login`)
- **Components:** PascalCase (e.g., `Login.jsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useAuth`)
- **Services:** camelCase (e.g., `authService.js`)
- **Styles:** Tailwind CSS utilities, PARKEA theme in `index.css`

### Git
- Descriptive commits in English or Spanish
- One branch per member: `{name}_{area}`
- Mandatory PR to the area branch (`backend`/`frontend`) before merging to `develop`

---

## Current Project Status

| Area | Progress | Status |
|------|----------|--------|
| **Database** | 100% | ✅ Complete |
| **Backend API** | ~85% | 🟢 Advanced |
| **Frontend** | ~25% | 🟡 Initial development |
| **Documentation** | ~40% | 🟡 In progress |
| **Testing** | 0% | 🔴 Not started |
| **Deployment** | 0% | 🔴 Not started |

### Identified Pending Work

| Task | Priority | Notes |
|------|----------|-------|
| Frontend view development | High | Backend is ready to consume |
| Automated testing (unit + integration) | High | Everything manually verified in Postman |
| Performance measurement | Medium | SRS requires < 3s with 50 concurrent users |
| API documentation (Swagger/OpenAPI) | Medium | No interactive documentation exists |
| Server/cloud deployment | Low | Pending for final phase |

---

## License

This project is developed for educational purposes within the **Software Analysis and Development (ADSO)** program at **SENA**.

© 2026 — ADSO 3231252 · Group 003

---

<div align="center">

**[⬆ Back to top](#-table-of-contents)**

</div>