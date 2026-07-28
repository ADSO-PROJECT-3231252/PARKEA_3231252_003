# PARKEA — Frontend

React 18 + Vite + Tailwind CSS.

## Setup

1. `cp .env.example .env` and set `VITE_API_URL` (defaults to `http://localhost:3000/api`)
2. `npm install`
3. `npm run dev`

## Structure

- `src/pages/` — route-level views
- `src/components/` — reusable UI components
- `src/context/` — React context (auth state)
- `src/hooks/` — custom hooks
- `src/services/` — API calls (axios)
- `src/routes/` — route definitions and route guards