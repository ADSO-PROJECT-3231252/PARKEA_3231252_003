# PARKEA API — Endpoint Reference

Base URL: `http://localhost:3000/api`

All protected endpoints require the header `Authorization: Bearer <token>`,
obtained from `POST /auth/login` or `POST /auth/login-admin`. Tokens expire
after 1 hour.

Every error response includes a short `code` field (see
`src/constants/errorCodes.js`) in addition to the `message`, so the
frontend can translate messages without comparing English text.

---

## Auth

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new user (HU-01) |
| POST | `/auth/login` | Public | Log in and receive a JWT (HU-05) |
| POST | `/auth/login-admin` | Public | Log in as administrator; rejects non-admin accounts (HU-06) |
| POST | `/auth/forgot-password` | Public | Request a password recovery email (HU-07, phase 1). Always responds the same way whether the email exists or not |
| POST | `/auth/reset-password` | Public | Set a new password using the emailed token (HU-07, phase 2). Token is single-use, expires in 1 hour |

## Vehicles

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/vehicles` | Authenticated | Register a vehicle (HU-10). First vehicle is auto-set as default |
| GET | `/vehicles` | Authenticated | List my vehicles (HU-11). Default vehicle always first |
| GET | `/vehicles/:id` | Authenticated (owner) | Single vehicle detail, used to prefill the edit form |
| PUT | `/vehicles/:id` | Authenticated (owner) | Edit a vehicle (HU-12). Plate is never editable |
| PATCH | `/vehicles/:id/default` | Authenticated (owner) | Set this vehicle as the default one |
| DELETE | `/vehicles/:id` | Authenticated (owner) | Soft-delete a vehicle (HU-13). Blocked if it has a Pending/Active reservation |

## Zones

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/zones` | Public | List active zones only (HU-09) |
| GET | `/zones/all` | Admin | List every zone, active and inactive (HU-19) |
| GET | `/zones/:id` | Public | Single zone detail. Not filtered by active status, so admins can reach a deactivated zone to edit/reactivate it |
| POST | `/zones` | Admin | Create a zone, auto-generates its parking spots (HU-20). Requires valid coordinates and a whole-number capacity > 0 |
| PUT | `/zones/:id` | Admin | Edit a zone; adjusts spots if capacity changes (HU-21) |
| PATCH | `/zones/:id/toggle` | Admin | Activate/deactivate a zone (HU-19) |
| GET | `/zones/:id/spots` | Admin | Detailed status of every physical spot in a zone |

## Reservations

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/reservations` | Authenticated | Reserve a spot, assigns one automatically (HU-14). 30 min–24h duration, up to 48h in advance, no overlap per vehicle |
| GET | `/reservations` | Authenticated | List my reservations, paginated (HU-18). Optional `?status=` filter and `?page=&limit=` |
| GET | `/reservations/:id` | Authenticated (owner) | Reservation confirmation details (HU-15), includes `holdExpiresAt` and zone coordinates |
| PATCH | `/reservations/:id/cancel` | Authenticated (owner) | Cancel a reservation (HU-16). Paid reservations are marked Refunded |

## Payments

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/payments/:reservationId` | Authenticated (owner) | Pay a pending reservation, simulated (HU-17). Card ending in `0002` simulates a decline. Paying an expired reservation returns a specific error (HU-26) |

## User profile

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/users/me` | Authenticated | Load my profile (HU-08) |
| PUT | `/users/me` | Authenticated | Edit full name and phone (HU-08). Email and document are never editable |
| PUT | `/users/me/password` | Authenticated | Change password (HU-08) |

## Admin

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/admin/dashboard?range=today\|week\|month` | Admin | Summary metrics: active reservations, revenue, active zones, new users (HU-22) |
| GET | `/admin/dashboard/reservations-by-zone?range=today\|week\|month` | Admin | Reservation count per active zone (HU-22) |
| GET | `/admin/dashboard/occupancy` | Admin | Occupied vs. total slots per zone, real-time (HU-22) |
| GET | `/admin/dashboard/payments-status?range=today\|week\|month` | Admin | Payment count by status (HU-22) |
| GET | `/admin/dashboard/recent-payments` | Admin | Last 5 payments (HU-22) |
| GET | `/admin/dashboard/alerts` | Admin | Operational alerts, e.g. zones at full capacity (HU-22) |
| GET | `/admin/users?search=&role=&status=&page=&limit=` | Admin | List users with filters, pagination, and reservation count per user (HU-23) |
| GET | `/admin/users/logs` | Admin | Last 10 role/status changes made by admins (HU-23) |
| PATCH | `/admin/users/:id/role` | Admin | Grant/revoke admin role (HU-23). Can't self-modify; keeps at least one active admin |
| PATCH | `/admin/users/:id/status` | Admin | Activate/deactivate an account (HU-23). Same protections as above |

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
  creation, releasing their spot back to the zone (HU-26).
- Paid (`Active`) reservations are automatically marked `Finished` once
  their end time passes, also releasing their spot.
- Every role/status change made through the admin endpoints is recorded
  in an internal audit log (`GET /admin/users/logs`).
- The primary administrator account can never be deactivated or have its
  role revoked, by anyone, including itself.