# PARKEA API — Endpoint Reference

Base URL: `http://localhost:3000/api`

All protected endpoints require the header `Authorization: Bearer <token>`,
obtained from `POST /auth/login`. Tokens expire after 1 hour.

Every error response includes a short `code` field (see
`src/constants/errorCodes.js`) in addition to the `message`, so the
frontend can translate messages without comparing English text.

---

## Auth

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new user (HU-01) |
| POST | `/auth/login` | Public | Log in and receive a JWT (HU-05) |

## Vehicles

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/vehicles` | Authenticated | Register a vehicle (HU-10) |
| GET | `/vehicles` | Authenticated | List my vehicles (HU-11) |
| PUT | `/vehicles/:id` | Authenticated (owner) | Edit a vehicle (HU-12) |
| DELETE | `/vehicles/:id` | Authenticated (owner) | Soft-delete a vehicle (HU-13) |

## Zones

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/zones` | Public | List active zones (HU-09) |
| POST | `/zones` | Admin | Create a zone, auto-generates its parking spots (HU-20) |
| PUT | `/zones/:id` | Admin | Edit a zone; adjusts spots if capacity changes (HU-21) |
| PATCH | `/zones/:id/toggle` | Admin | Activate/deactivate a zone (HU-19) |
| GET | `/zones/:id/spots` | Admin | Detailed status of every physical spot in a zone |

## Reservations

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/reservations` | Authenticated | Reserve a spot, assigns one automatically (HU-14) |
| GET | `/reservations/:id` | Authenticated (owner) | Reservation confirmation details (HU-15) |
| PATCH | `/reservations/:id/cancel` | Authenticated (owner) | Cancel a reservation (HU-16) |

## Payments

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/payments/:reservationId` | Authenticated (owner) | Pay a pending reservation, simulated (HU-17). Card ending in `0002` simulates a decline |

## User profile

| Method | Route | Access | Description |
|---|---|---|---|
| PUT | `/users/me` | Authenticated | Edit full name and phone (HU-08) |
| PUT | `/users/me/password` | Authenticated | Change password (HU-08) |

## Admin

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/admin/dashboard?range=today\|week\|month` | Admin | Summary metrics (HU-22) |
| GET | `/admin/dashboard/occupancy` | Admin | Occupied vs. total slots per zone (HU-22) |
| GET | `/admin/dashboard/payments-status` | Admin | Payment count by status (HU-22) |
| GET | `/admin/dashboard/recent-payments` | Admin | Last 5 payments (HU-22) |
| GET | `/admin/users?search=&role=&status=` | Admin | List users with filters + summary (HU-23) |
| PATCH | `/admin/users/:id/role` | Admin | Grant/revoke admin role (HU-23) |
| PATCH | `/admin/users/:id/status` | Admin | Activate/deactivate an account (HU-23) |

---

## Health check

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | Confirms the server is running |

---

## Notes

- Deleted resources (vehicles, zones, user accounts) are never actually
  removed from the database — they're soft-deleted or deactivated, so
  reservation and payment history always keeps its references intact.
- Parking spot assignment is fully automatic; there is no endpoint for a
  user to choose a specific spot.
- Unpaid (`Pending`) reservations expire automatically 15 minutes after
  creation, releasing their spot back to the zone.