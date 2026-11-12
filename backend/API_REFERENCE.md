# PARKEA API — Endpoint Reference

Base URL: `http://localhost:3000/api`

All protected endpoints require the header `Authorization: Bearer <token>`,
obtained from `POST /auth/login` or `POST /auth/login-admin`. Tokens expire
after 1 hour, and stop working as soon as the password of the account changes
(from the profile or with a recovery link): they answer `403 INVALID_TOKEN`.

Every error response includes a short `code` field (see
`src/constants/errorCodes.js`) in addition to the `message`, so the
frontend can translate messages without comparing English text.
Validation errors answer 400 `VALIDATION_ERROR` with an `errors` list
instead of a `message`.

Request bodies are JSON of up to 100 kB. A body that is not valid JSON
answers 400 `INVALID_JSON`, a larger one 413 `PAYLOAD_TOO_LARGE`, and an
unsupported `Content-Encoding` or charset 415 `UNSUPPORTED_MEDIA_TYPE`.
A route that does not exist answers 404 `ROUTE_NOT_FOUND`.

---

## Auth

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new user (HU-01). The account is created as not verified and gets a verification email (HU-30). The email and the document of an account that is not verified stay taken while one of its links is valid; after that, a new sign-up takes the place of that account. Two sign-ups with the same data at the same moment answer 201 and 409. Attempt limit, see below |
| POST | `/auth/login` | Public | Log in and receive a JWT (HU-05). An account that is not verified answers `403 EMAIL_NOT_VERIFIED`, only after the right password (HU-30). Attempt limit, see below |
| POST | `/auth/login-admin` | Public | Log in as administrator; rejects non-admin accounts (HU-06) and accounts that are not verified (HU-30). Shares the attempt limit of `/auth/login` |
| POST | `/auth/forgot-password` | Public | Request a password recovery email (HU-07, phase 1). Always responds the same way, and just as fast, whether the email exists or not. A new link makes the previous ones stop working. Attempt limit, see below |
| POST | `/auth/reset-password` | Public | Set a new password using the emailed token (HU-07, phase 2). Token is single-use, expires in 1 hour. It also verifies an account that was not verified yet, because the link proves the email is the user's (HU-30). The sessions of the account and its other recovery links stop working. The same password as the current one answers `400 PASSWORD_UNCHANGED`, and the link still works after that answer |
| POST | `/auth/verify-email` | Public | Verify the email with the token of the link `{ token }` (HU-30). Single-use, expires in 24 hours; a used, expired or unknown token answers `400 VERIFICATION_TOKEN_INVALID` |
| POST | `/auth/resend-verification` | Public | Send a new verification link `{ email }`; the previous links stop working (HU-30). Always responds the same way whether the email exists or not. Attempt limit, see below |

### Attempt limits

Over a limit the API answers 429 `TOO_MANY_REQUESTS`, and the `RateLimit`
headers say how many tries are left and when the count starts again. The
counts are kept per network (IP address) and, where it says so, per email
on that network, so on a shared Wi-Fi each person has their own tries.

| Route | Limit | What counts |
|---|---|---|
| `/auth/login` and `/auth/login-admin` | 10 every 15 minutes per email, and 100 every 15 minutes per network | Only failed sign-ins (not the ones that work, not server errors). The user and admin sign-ins share the counts |
| `/auth/forgot-password` and `/auth/resend-verification` | 5 every 15 minutes per email, and 20 every hour per network, each route with its own counts | Every request, because each one can send an email |
| `/auth/register` | 30 every hour per network | Only the accounts that are created |

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
| GET | `/zones` | Public | List active zones only (HU-09). Every zone has `open24h` and its `schedule` (HU-29, see below) |
| GET | `/zones/all` | Admin | List every zone, active and inactive (HU-19) |
| GET | `/zones/:id` | Public | Single zone detail. Not filtered by active status, so admins can reach a deactivated zone to edit/reactivate it |
| POST | `/zones` | Admin | Create a zone, auto-generates its parking spots (HU-20). Requires valid coordinates inside Colombia (`COORDINATES_OUTSIDE_COLOMBIA` otherwise), a whole-number capacity from 1 to 500, an hourly rate of 0 or more with at most 2 decimals, and its opening hours (HU-29): `open24h: true`, or `open24h: false` with a `schedule` |
| PUT | `/zones/:id` | Admin | Edit a zone; adjusts spots if capacity changes (HU-21). Same rules as creation, opening hours included. New hours apply to new reservations and extensions; existing reservations keep their times (HU-29) |
| PATCH | `/zones/:id/toggle` | Admin | Activate/deactivate a zone (HU-19) |
| GET | `/zones/:id/spots` | Admin | Detailed status of every physical spot in a zone |

### Opening hours (HU-29)

A zone is either open 24 hours (`open24h: true`, `schedule: []`) or has its
own hours (`open24h: false`). `schedule` has one item for each day the zone
opens, in Colombia time; a day that is not in the list is closed:

```json
{
  "open24h": false,
  "schedule": [
    { "day": 1, "opensAt": "06:00", "closesAt": "20:00" },
    { "day": 6, "opensAt": "08:00", "closesAt": "14:00" }
  ]
}
```

- `day` goes from 1 (Monday) to 7 (Sunday), with each day at most once.
- `opensAt` and `closesAt` are `HH:MM` from `00:00` to `23:59`, with the
  opening at least 30 minutes before the closing. Hours never cross
  midnight; for the night there is `open24h: true`.
- At least one day must be open. When `open24h` is `true`, `schedule` is
  ignored.
- A missing or wrong `open24h` answers 400 `VALIDATION_ERROR` on `open24h`.
  A wrong schedule answers 400 `VALIDATION_ERROR` with one item for each
  problem on `schedule`; an item about one day also has its `day`.
- Zones created before HU-29 are open 24 hours.

## Reservations

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/reservations` | Authenticated | Reserve a spot, assigns one automatically (HU-14). 30 min–24h duration, up to 48h in advance, no overlap per vehicle. With `openEnded: true` no `endTime` is needed: it is an open stay without an exit time (HU-27). The whole stay must fit the opening hours of the zone (HU-29, see below). A user with an unpaid balance gets 409 `PENDING_BALANCE` |
| GET | `/reservations` | Authenticated | List my reservations, paginated (HU-18). Optional `?status=` filter and `?page=&limit=` (at most 100 per page). Each one has `openEnded`, `latestEndTime` (HU-29), `amount` with `amountType` (`estimated`, `paid` or, for an open stay that is running, `so_far`) and `extensions` |
| GET | `/reservations/:id` | Authenticated (owner) | Reservation confirmation details (HU-15), includes `holdExpiresAt`, `latestEndTime` (HU-29) and zone coordinates. `paymentSummary` has `paidTotal` and `extensions` (HU-28); an open stay that has not ended has no `durationHours` yet |
| PATCH | `/reservations/:id/cancel` | Authenticated (owner) | Cancel a reservation before its start (HU-16). What was paid is marked Refunded, extensions included |
| PATCH | `/reservations/:id/finish` | Authenticated (owner) | Finish an open stay when the user leaves (HU-27). Charges every started hour, subtracts what was paid and creates a pending balance if something is still owed. Optional `expectedHours` (the hours shown to the user): if another hour started meanwhile it answers 409 `STAY_AMOUNT_CHANGED` with the new amount |
| PATCH | `/reservations/:id/extend` | Authenticated (owner) | Extend a paid stay that has not ended (HU-28). `{ fromEndTime, newEndTime, paymentMethod, cardLastFour }` pays the added time now; `{ fromEndTime, openEnded: true }` turns it into an open stay, paid when it ends. Never more than 24 hours from the entry, nor past the closing time of the zone (HU-29). If the exit time changed in another tab it answers 409 `RESERVATION_CHANGED` |

### Reservations and opening hours (HU-29)

- The whole stay must fit the hours of the day of the entry: entering at
  the opening time and leaving at the closing time are allowed, and the
  entry must be at least 30 minutes before the closing time. Otherwise it
  answers 400 `OUTSIDE_ZONE_HOURS`; on a closed day, 400
  `ZONE_CLOSED_THAT_DAY`. Both include `hours`, the hours of that day:
  `{ "day": 2, "opensAt": "06:00", "closesAt": "20:00" }` or
  `{ "day": 1, "closed": true }`.
- An open stay ends at the closing time of its day (entry + 24 hours in a
  zone open 24 hours).
- An extension cannot move the exit time past the closing time of the day
  of the entry, with the hours the zone has now, and switching to an open
  stay ends it at that closing time. Otherwise it answers 400
  `OUTSIDE_ZONE_HOURS` or `ZONE_CLOSED_THAT_DAY`.
- `latestEndTime`, while the reservation is `Pending` or `Active`: when an
  open stay ends by itself, or how far a stay with an exit time can be
  extended now. It is `null` once the reservation is over.

## Payments

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/payments/:reservationId` | Authenticated (owner) | Pay a pending reservation, simulated (HU-17). Card ending in `0002` simulates a decline. Paying an expired reservation returns a specific error (HU-26). An open stay pays only its first hour here (HU-27) |
| POST | `/payments/:reservationId/balance` | Authenticated (owner) | Pay the balance a finished open stay still owes (HU-27). Same payment fields and test card; 400 `NO_PENDING_BALANCE` if nothing is owed |

## User profile

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/users/me` | Authenticated | Load my profile (HU-08) |
| PUT | `/users/me` | Authenticated | Edit full name and phone (HU-08). Email and document are never editable |
| PUT | `/users/me/password` | Authenticated | Change password (HU-08). The other sessions of the account and its recovery links stop working; the answer brings a new `token` so this session goes on |

## Admin

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/admin/dashboard?range=today\|week\|month` | Admin | Summary metrics: active reservations, revenue, active zones, new users (HU-22) |
| GET | `/admin/dashboard/reservations-by-zone?range=today\|week\|month` | Admin | Reservation count per active zone (HU-22) |
| GET | `/admin/dashboard/occupancy` | Admin | Occupied vs. total slots per zone, real-time (HU-22) |
| GET | `/admin/dashboard/payments-status?range=today\|week\|month` | Admin | Payment count by status (HU-22) |
| GET | `/admin/dashboard/recent-payments` | Admin | Last 5 payments (HU-22) |
| GET | `/admin/dashboard/alerts` | Admin | Operational alerts, e.g. zones at full capacity (HU-22) |
| GET | `/admin/users?search=&role=&status=&page=&limit=` | Admin | List users with filters, pagination (at most 100 per page), and reservation count per user (HU-23) |
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
- An open stay keeps a provisional exit time: entry + 24 hours, or the
  closing time of its zone (HU-29). If it is not finished by then, it
  closes automatically, the hours up to that time are charged and what was
  not paid stays as a pending balance (HU-27).
- Until a pending balance is paid, the user cannot make new reservations.
- Every role/status change made through the admin endpoints is recorded
  in an internal audit log (`GET /admin/users/logs`).
- The primary administrator account can never be deactivated or have its
  role revoked, by anyone, including itself.
