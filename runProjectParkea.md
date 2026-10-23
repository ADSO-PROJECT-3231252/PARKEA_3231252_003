# Run PARKEA locally

The steps to run PARKEA on your computer, in order. For the rest of the project information (tech stack, API, conventions), see the [README](README.md).

## 1. Requirements

- Node.js 22 or newer: check it with `node -v`.
- MySQL 8, with the service running.
- Git. Run the commands below in Git Bash.

## 2. Get the code

```bash
git clone https://github.com/ADSO-PROJECT-3231252/PARKEA_3231252_003.git
cd PARKEA_3231252_003
git checkout develop
```

`main` only has the first commit; the working code is in `develop`.

## 3. Run the backend

Create your `.env` from the example:

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in:

- `DATABASE_URL`: your local MySQL user and password, for example `mysql://root:your_password@localhost:3306/parkea_db`. If the password has special characters, encode them (`$` → `%24`, `@` → `%40`). The user must be allowed to create databases.
- `JWT_SECRET`: any long random text.
- `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS`: only needed to send the password recovery emails. Leave them empty otherwise.

The `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` lines are not used.

Install the dependencies, create the database and load the demo data:

```bash
npm ci
npm run db:create
npm run db:migrate
npm run db:seed
```

Run `npm run db:seed` only once: the second time it fails with `Validation error` because the demo data is already there. To start over, see step 6.

Start the API:

```bash
npm run dev
```

It is ready when it prints `PARKEA server running on http://localhost:3000`. Open http://localhost:3000/api/health: it must answer `{"status":"ok","service":"PARKEA API"}`.

If it stops with `ECONNREFUSED`, the MySQL service is not running.

## 4. Run the frontend

In a second terminal, from the repository root:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Open http://localhost:5173.

## 5. Sign in

- Administrator: `admin@parkea.com`, at http://localhost:5173/admin/login. Its password is in `backend/src/seeders/20260808234824-demo-primary-admin.js`.
- User: create an account with “Crear cuenta” at http://localhost:5173/register.