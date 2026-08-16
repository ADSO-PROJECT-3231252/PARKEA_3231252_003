<div align="center">

**[⬆ Volver al inicio](#-tabla-de-contenidos)**

</div>

---

---

# 🇬🇧 English Version

<div align="center">

# 🅿️ PARKEA

### *Smart Urban Parking Reservation System*

**ADSO 3231252 · Group 003 · SENA CDITI**

</div>

---

## 📑 Table of Contents

- [🎯 Project Description](#-project-description)
- [👥 Development Team](#-development-team)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Repository Structure](#-repository-structure)
- [🌿 Project Branches](#-project-branches)
- [🚀 Installation and Setup](#-installation-and-setup)
  - [Prerequisites](#prerequisites)
  - [Database](#database)
  - [Backend](#backend-1)
  - [Frontend](#frontend-1)
- [⚙️ Environment Variables](#️-environment-variables)
- [📜 Available Scripts](#-available-scripts)
- [🎨 PARKEA Color Palette](#-parkea-color-palette)
- [📋 User Stories](#-user-stories)
- [🔐 Code Conventions](#-code-conventions)
- [📊 Current Project Status](#-current-project-status)
- [📄 License](#-license-1)

---

## 🎯 Project Description

**PARKEA** is an intelligent urban parking reservation system that allows users to:

- 🔍 Explore available parking zones in their city
- 📅 Reserve a spot in advance to guarantee their space
- 💳 Make secure simulated payments
- 🚗 Manage their registered vehicles
- 📊 Administrators: manage zones, users, and view real-time metrics

The system is designed under a **MERN-like** architecture (React + Node.js + MySQL) with clear separation between frontend, backend, and persistence layer.

### Documented Scope (SRS)

> The system operates under a **mandatory reservation model**: a vehicle must have an active reservation to occupy a spot. Drive-in parking without a prior reservation is not supported. This is a documented limitation, not an omission.

---

## 👥 Development Team

| Name | Role | GitHub | Main Branch |
|------|------|--------|-------------|
| **Michael Isaza** | Scrum Master / Tech Lead | [@MichaelIsaza](https://github.com/MichaelIsaza) | `isaza_backend`, `isaza_frontend` |
| **Jhoan Marín** | Full Stack Developer | [@jhoanmarin227](https://github.com/jhoanmarin227) | `marin_backend`, `marin_frontend` |
| **Stiven Sánchez** | Backend Developer | [@Stiven5-ctrl](https://github.com/Stiven5-ctrl) | `stiven_backend` |
| **David León** | Frontend Developer / DBA | [@David-Leon1089](https://github.com/David-Leon1089) | `leon_backend`, `leon_sql` |
| **Jhoan Almario** | Analyst / Backend | [@johan_almario](https://github.com/johan_almario) | `almario_backend`, `almario_frontend` |

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.7 | UI Library |
| Vite | 8.1.1 | Bundler and dev server |
| Tailwind CSS | 4.3.3 | Utility-first CSS framework |
| React Router DOM | 7.18.1 | SPA routing |
| Axios | 1.18.1 | HTTP client for REST API |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | JavaScript runtime |
| Express | 5.2.1 | Web framework |
| Sequelize | 6.37.8 | MySQL ORM |
| MySQL2 | 3.23.1 | Database driver |
| JSON Web Token | 9.0.3 | Stateless authentication |
| bcrypt | 6.0.0 | Password hashing |
| express-validator | 7.3.2 | Request validation |
| Helmet | 8.3.0 | HTTP security |
| CORS | 2.8.6 | Cross-origin policy |
| Nodemailer | 6.x | Email sending (Mailtrap) |
| UUID | 11.x | Unique identifiers |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| MySQL | 8.0 | Relational database engine |

### Development Tools
| Tool | Use |
|------|-----|
| Git + GitHub | Version control and collaboration |
| Postman | Manual API testing |
| VS Code | Primary IDE |
| ESLint | JavaScript linter |

---

## 📁 Repository Structure

```
PARKEA_3231252_003/
│
├── 📁 backend/
│   ├── src/
│   │   ├── app.js                 # Express config (middlewares, routes)
│   │   ├── server.js              # Entry point (sync DB + jobs + listen)
│   │   ├── 📁 config/             # Sequelize + MySQL config
│   │   ├── 📁 constants/          # Centralized error codes
│   │   ├── 📁 controllers/        # Business logic (one per HU module)
│   │   ├── 📁 jobs/               # Background jobs (expiration, finalization)
│   │   ├── 📁 middlewares/        # Auth, error handling
│   │   ├── 📁 models/             # Sequelize models (8 tables)
│   │   ├── 📁 routes/             # API route definitions
│   │   └── 📁 validators/         # express-validator rules
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── 📁 frontend/
│   ├── src/
│   │   ├── main.jsx               # React entry point
│   │   ├── App.jsx                # Router + AuthProvider
│   │   ├── 📁 assets/             # Images, logos, illustrations
│   │   ├── 📁 components/         # Reusable UI components
│   │   ├── 📁 context/            # Global state (AuthContext)
│   │   ├── 📁 hooks/              # Custom React hooks
│   │   ├── 📁 pages/              # Route-based views
│   │   ├── 📁 routes/             # Route definitions
│   │   ├── 📁 services/           # API calls (Axios)
│   │   ├── 📁 utils/              # Helpers and validators
│   │   └── index.css              # Tailwind CSS + PARKEA theme
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── .env.example
│   └── index.html
│
├── 📁 database/
│   └── schema.sql                 # Complete DDL script (8 tables)
│
├── 📁 docs/
│   ├── SRS.md                     # Software Requirements Specification
│   └── mockups/                   # UI designs
│
├── .gitignore
├── README.md                      # ← This document
└── LICENSE
```

---

## 🌿 Project Branches

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
| `almario_backend` | Almario's individual work | @johan_almario | 🟢 Active |
| `almario_frontend` | Almario's individual work | @johan_almario | 🔴 Inactive |

**Workflow:** Simplified Git Flow. Each member works on their personal branch, makes PR to `develop`, and `develop` merges to `main` only on stable releases.

---

## 🚀 Installation and Setup

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20.x
- [MySQL](https://mysql.com) ≥ 8.0
- [Git](https://git-scm.com)

### Database

1. Create the database in MySQL:
```sql
CREATE DATABASE parkea_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Run the DDL script:
```bash
mysql -u root -p parkea_db < database/schema.sql
```

> The script creates 8 tables: roles, users, vehicles, zones, parking_spots, reservations, payments, password_reset_tokens, admin_action_logs.

### Backend

```bash
# 1. Clone the repository
git clone https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003.git
cd PARKEA_3231252_003/backend

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your credentials (see Environment Variables section)

# 4. Start development server
npm run dev

# Server running at: http://localhost:3000
```

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

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=parkea_db
DB_USER=root
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_very_secure_secret_key
JWT_EXPIRES_IN=1h

# Mailtrap (for password recovery)
MAILTRAP_HOST=sandbox.smtp.mailtrap.io
MAILTRAP_PORT=2525
MAILTRAP_USER=your_mailtrap_user
MAILTRAP_PASS=your_mailtrap_password
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000/api
```

---

## 📜 Available Scripts

### Backend
| Script | Command | Description |
|--------|---------|-------------|
| Development | `npm run dev` | Nodemon + auto-reload |
| Production | `npm start` | Direct Node |
| Lint | `npm run lint` | ESLint |

### Frontend
| Script | Command | Description |
|--------|---------|-------------|
| Development | `npm run dev` | Vite dev server |
| Build | `npm run build` | Production build |
| Preview | `npm run preview` | Build preview |
| Lint | `npm run lint` | ESLint |

---

## 🎨 PARKEA Color Palette

Colors are defined in `frontend/src/index.css` as Tailwind v4 custom CSS variables:

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
| `neutral-500` | `#6E7572` | Secondary text |
| `neutral-600` | `#545B58` | Labels |
| `neutral-700` | `#3D4441` | Primary text |
| `neutral-800` | `#272C2A` | Headings |
| `neutral-900` | `#161A18` | Maximum contrast text |

### Typography
| Token | Family | Use |
|-------|--------|-----|
| `font-display` | Barlow Condensed | Headings |
| `font-sans` | Barlow | Body text |
| `font-mono` | IBM Plex Mono | Code, IDs |

---

## 📋 User Stories

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
| HU-10 | Register Vehicle | @MichaelIsaza | ✅ | 🟡 |
| HU-11 | View My Vehicles | @MichaelIsaza | ✅ | 🟡 |
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
| HU-24 | Sign Out | @centinel117 | ✅ | 🟡 |
| HU-25 | View Zones on Map | @jhoanmarin227 | N/A | 🔴 |
| HU-26 | Reservation Expiration | @MichaelIsaza | ✅ | N/A |

**Legend:**
- ✅ Implemented and verified
- 🟡 In development / partial
- 🔴 Not started
- N/A Not applicable (automatic process or backend-only)

---

## 🔐 Code Conventions

### Backend
- **Language:** Spanish for variable, function, and file names (e.g., `cambiarRol`, `vehiculo.controller.js`)
- **Error codes:** English uppercase with underscores in `constants/errorCodes.js`
- **Models:** PascalCase singular (e.g., `Usuario`, `Vehiculo`)
- **Tables:** Plural snake_case in DB (e.g., `users`, `parking_spots`)
- **Controllers:** async/await with try/catch, errors passed to `next(error)`
- **Validation:** express-validator in separate `*.validator.js` files

### Frontend
- **Language:** Spanish for UI, English for code
- **Components:** PascalCase (e.g., `LoginPage.jsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useAuth`)
- **Services:** camelCase (e.g., `authService.js`)
- **Styles:** Tailwind CSS utilities, PARKEA theme in `index.css`

### Git
- Descriptive commits in English or Spanish
- One branch per member: `{name}_{area}`
- Mandatory PR to `develop` before merging

---

## 📊 Current Project Status

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

## 📄 License

This project is developed for educational purposes within the **Software Analysis and Development (ADSO)** program at **SENA**.

© 2026 — ADSO 3231252 · Group 003

---

<div align="center">

**[⬆ Back to top](#-table-of-contents)**

</div>
