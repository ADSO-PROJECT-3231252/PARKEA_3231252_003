# PARKEA API — Endpoint Reference

Base URL: `http://localhost:3000/api`

All protected endpoints require the header `Authorization: Bearer <token>`,
obtained from `POST /auth/login` or `POST /auth/login-admin`. Tokens expire
after 1 hour, and stop working as soon as the password of the account changes
(from the profile or with a recovery link): they answer `403 INVALID_TOKEN`.

In the Access column, **Authenticated** is any signed-in account, **User**
only an account with the user role and **Admin** only an administrator. The
vehicles, reservations and payments belong to users: an administrator gets
403 `FORBIDDEN_ROLE` there (#316). The role is read from the database on
every request, not from the token. Creating a reservation and paying it read
the account again after locking it (#348): if an administrator deactivated it
or made it administrator while the request waited, it answers 403
`ACCOUNT_DEACTIVATED` or `FORBIDDEN_ROLE` and saves nothing.

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
| POST | `/auth/reset-password` | Public | Set a new password using the emailed token (HU-07, phase 2). Token is single-use, expires in 1 hour. It also verifies an account that was not verified yet, because the link proves the email is the user's (HU-30). The sessions of the account and its other recovery links stop working. The same password as the current one answers `400 PASSWORD_UNCHANGED`, and the link still works after that answer. Attempt limit, see below |
| POST | `/auth/verify-email` | Public | Verify the email with the token of the link `{ token }` (HU-30). Single-use, expires in 24 hours; a used, expired or unknown token answers `400 VERIFICATION_TOKEN_INVALID` |
| POST | `/auth/resend-verification` | Public | Send a new verification link `{ email }`; the previous links stop working (HU-30). Always responds the same way whether the email exists or not. Attempt limit, see below |

### Attempt limits

Over a limit the API answers 429 `TOO_MANY_REQUESTS`, and the `RateLimit`
headers say how many tries are left and when the count starts again. The
counts are kept per network (IP address) and, where it says so, per email
on that network or per account, so on a shared Wi-Fi each person has their
own tries. The sign-up and the recovery link are the exception: they are
counted only per network, so everyone on that network shares their count
(the request of the recovery link has no email).

| Route | Limit | What counts |
|---|---|---|
| `/auth/login` and `/auth/login-admin` | 10 every 15 minutes per email, and 100 every 15 minutes per network | Only failed sign-ins (not the ones that work, not server errors). The user and admin sign-ins share the counts |
| `/auth/forgot-password` and `/auth/resend-verification` | 5 every 15 minutes per email, and 20 every hour per network, each route with its own counts | Every request, because each one can send an email |
| `/auth/register` | 30 every hour per network | Only the accounts that are created |
| `/auth/reset-password` | 10 every 15 minutes per network | Only failed tries (a link that is not valid, used or expired, a password that is not valid). Not the ones that work, not server errors |
| `/users/me/password` | 5 every 15 minutes per account, from any network | Only failed changes (a wrong current password, a new password that is not valid or is the same). Not the ones that work, not server errors |

## Vehicles

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/vehicles` | User | Register a vehicle (HU-10). First vehicle is auto-set as default. Brand, model and color (up to 50, 50 and 30 characters) only accept letters, numbers, spaces, hyphens and periods, with at least one letter or number. The text is checked as it was typed, then saved normalized. A user can have at most 5 active vehicles (a deleted one does not count): with 5, the next one answers 409 `VEHICLE_LIMIT_REACHED` (#299) |
| GET | `/vehicles` | User | List my vehicles (HU-11). Default vehicle always first |
| GET | `/vehicles/:id` | User (owner) | Single vehicle detail, used to prefill the edit form |
| PUT | `/vehicles/:id` | User (owner) | Edit a vehicle (HU-12). Plate is never editable. Brand, model and color follow the same rules as when registering, so a vehicle saved with other characters answers 400 until that field is corrected |
| PATCH | `/vehicles/:id/default` | User (owner) | Set this vehicle as the default one |
| DELETE | `/vehicles/:id` | User (owner) | Soft-delete a vehicle (HU-13). Blocked if it has a Pending/Active reservation |

## Zones

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/zones` | Public | List active zones only (HU-09), the ones with the largest share of free spots first. Every zone has `open24h` and its `schedule` (HU-29, see below), and `availableSlots`: the spots free now (#373, see below) |
| GET | `/zones/all` | Admin | List every zone, active and inactive (HU-19). Each one also has `activeReservations` (its `Pending` and `Active` reservations) and `spotsInUse` (#373: the spots with a `Pending` or `Active` reservation from now on, the least capacity it can have) |
| GET | `/zones/:id` | Public | Single zone detail. Not filtered by active status, so admins can reach a deactivated zone to edit/reactivate it |
| POST | `/zones` | Admin | Create a zone, auto-generates its parking spots (HU-20). Requires valid coordinates inside Colombia (`COORDINATES_OUTSIDE_COLOMBIA` otherwise), a whole-number capacity from 1 to 500, an hourly rate greater than 0 with at most 2 decimals (#316: a rate of 0 answers 400 `VALIDATION_ERROR` on `hourlyRate`, a negative one `NEGATIVE_VALUE`), and its opening hours (HU-29): `open24h: true`, or `open24h: false` with a `schedule`. The name must not belong to another zone, without telling capitals or accents apart: 409 `ZONE_NAME_TAKEN`, also when two admins save the same name at the same time (#304, unique index `zones_name_unique`) |
| PUT | `/zones/:id` | Admin | Edit a zone; adjusts spots if capacity changes (HU-21). Same rules as creation, opening hours included. New hours apply to new reservations and extensions; existing reservations keep their times (HU-29). Lowering the capacity disables only spots with no `Pending` or `Active` reservation from now on, the highest numbers first; below the spots in use it answers 400 `CAPACITY_BELOW_IN_USE` with `spotsInUse` (#373) |
| PATCH | `/zones/:id/toggle` | Admin | Activate/deactivate a zone (HU-19). The body says the state wanted, `{ "isActive": true }` or `false` (#304): repeating it changes nothing, so two admins who deactivate it at the same time both leave it inactive. Without a real boolean it answers 400 `VALIDATION_ERROR` |

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

### Free spots (#373)

A spot is taken only for the hours of its reservations (see
[Spots by time range](#spots-by-time-range-373)), so the free spots of a
zone depend on the hours asked and are not stored.

- Every zone the API sends has `availableSlots`: the spots free now for the
  shortest stay, 30 minutes from now. A zone with 0 now can still have
  room for later hours.
- `GET /zones` orders the zones by `availableSlots / totalSlots`, the
  largest first, and then by name.
- The status of a spot only says whether it can be reserved: `Available`
  or `Disabled` (a spot left out by a lower capacity).

## Reservations

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/reservations` | User | Reserve a spot, assigns one automatically (HU-14). 30 min–24h duration, up to 48h in advance, no overlap per vehicle. With `openEnded: true` no `endTime` is needed: it is an open stay without an exit time (HU-27). The whole stay must fit the opening hours of the zone (HU-29, see below). A user with an unpaid balance gets 409 `PENDING_BALANCE`. A user can have at most 2 reservations in `Pending` at the same time: with 2, the next one answers 409 `TOO_MANY_PENDING_RESERVATIONS` until one is paid, cancelled or expires (#299) |
| GET | `/reservations` | User | List my reservations, paginated (HU-18). Optional `?status=` filter and `?page=&limit=` (at most 100 per page). Each one has `holdExpiresAt` (until when a `Pending` one can be paid or cancelled, #347; `null` once it is paid), `openEnded`, `latestEndTime` (HU-29), `amount` with `amountType` (`estimated`, `paid` or, for an open stay that is running, `so_far`) and `extensions` |
| GET | `/reservations/:id` | User (owner) | Reservation confirmation details (HU-15), includes `holdExpiresAt`, `latestEndTime` (HU-29) and zone coordinates. `paymentSummary` has `paidTotal` and `extensions` (HU-28); an open stay that has not ended has no `durationHours` yet |
| PATCH | `/reservations/:id/cancel` | User (owner) | Cancel a reservation (HU-16). A `Pending` one (not paid) while its 15 minutes to pay last, even after its start time (#316); once they end it answers 400 `RESERVATION_EXPIRED` and changes nothing, like the payment, even if the job has not marked it `Expired` yet (#347). An `Expired` one answers the same. An `Active` one (paid) only before its start time, otherwise 409 `RESERVATION_ALREADY_STARTED` (#316). A `Cancelled` or `Finished` one answers 409 `RESERVATION_NOT_CANCELLABLE`. What was paid is marked Refunded, extensions included |
| PATCH | `/reservations/:id/finish` | User (owner) | Finish an open stay when the user leaves (HU-27). Charges every started hour, subtracts what was paid and creates a pending balance if something is still owed. Optional `expectedHours` (the hours shown to the user): if another hour started meanwhile it answers 409 `STAY_AMOUNT_CHANGED` with the new amount |
| PATCH | `/reservations/:id/extend` | User (owner) | Extend a paid stay that has not ended (HU-28). `{ fromEndTime, newEndTime, paymentMethod, cardLastFour }` pays the added time now; `{ fromEndTime, openEnded: true }` turns it into an open stay, paid when it ends. Never more than 24 hours from the entry, nor past the closing time of the zone (HU-29). If the exit time changed in another tab it answers 409 `RESERVATION_CHANGED`. A stay never changes spot: if another reservation holds it in the added time, it answers 409 `SPOT_RESERVED_LATER` with `freeUntil` (#373) |

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

### Spots by time range (#373)

- A reservation holds its spot only for its hours: while it is `Active`,
  or `Pending` with its 15 minutes to pay still running. A `Pending` one
  whose 15 minutes ended no longer holds it, even before the job marks it
  `Expired` (#347).
- Two reservations of the same spot keep 10 minutes between them: a spot
  reserved until 10:00 can be reserved again from 10:10. A stay that ended
  keeps those 10 minutes after its exit time too, before and after the job
  marks it `Finished`.
- The check of the vehicle (409 `VEHICLE_RESERVATION_OVERLAP`) follows the
  same rule: a `Pending` reservation whose 15 minutes ended does not block
  its car.
- `POST /reservations` gives the spot with the lowest number that is free
  for the stay. When none is free it answers 409 `NO_SPOTS_AVAILABLE`, even
  if the zone has free spots at other hours. An open stay needs a spot
  free until its provisional exit time (entry + 24 hours, or the closing
  time of the zone).
- An extension needs the same spot free for the added time, with the 10
  minutes after it; switching to an open stay, until its provisional exit
  time. Otherwise it answers 409 `SPOT_RESERVED_LATER`, charges nothing,
  and `freeUntil` says until when the spot is free:

```json
{ "code": "SPOT_RESERVED_LATER", "message": "…", "freeUntil": "2026-11-23T15:50:00.000Z" }
```

- Cancelling, expiring or finishing a reservation changes only its status:
  from then its hours are free again (for a finished one, 10 minutes after
  its exit time).
- Every reservation, extension and payment of a zone locks the zone (the
  payment after its reservation), so they never decide on the same spot at
  the same time. A payment checks the 15 minutes after that lock: if they
  ended while it waited, it answers 400 `RESERVATION_EXPIRED`, because a
  new reservation may already have the spot.

## Payments

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/payments/:reservationId` | User (owner) | Pay a pending reservation, simulated (HU-17). Card ending in `0002` simulates a decline. It can be paid until its 15 minutes to pay end, even if its start time has passed (#316); after that it answers 400 `RESERVATION_EXPIRED` (HU-26). An open stay pays only its first hour here (HU-27) |
| POST | `/payments/:reservationId/balance` | User (owner) | Pay the balance a finished open stay still owes (HU-27). Same payment fields and test card; 400 `NO_PENDING_BALANCE` if nothing is owed |

## User profile

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/users/me` | Authenticated | Load my profile (HU-08) |
| PUT | `/users/me` | Authenticated | Edit full name and phone (HU-08). Email and document are never editable. At least one of the two must come: without both it answers 400 `MISSING_REQUIRED_FIELDS` (#300) |
| PUT | `/users/me/password` | Authenticated | Change password (HU-08). The other sessions of the account and its recovery links stop working; the answer brings a new `token` so this session goes on. Attempt limit, see [Attempt limits](#attempt-limits) |

## Admin

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/admin/dashboard?range=today\|week\|month` | Admin | Summary metrics: active reservations, revenue, active zones and registered users, which is the total number of accounts and not the new ones (HU-22). Ranges, see below |
| GET | `/admin/dashboard/reservations-by-zone?range=today\|week\|month` | Admin | Reservation count per active zone (HU-22) |
| GET | `/admin/dashboard/occupancy` | Admin | Occupied vs. total slots per active zone, now (HU-22): the occupied ones are the ones not free for the next 30 minutes, that is, `totalSlots` minus `availableSlots` (#373) |
| GET | `/admin/dashboard/payments-status?range=today\|week\|month` | Admin | Payment count by status (HU-22) |
| GET | `/admin/dashboard/recent-payments` | Admin | Last 5 payments (HU-22) |
| GET | `/admin/dashboard/alerts` | Admin | Operational alerts, e.g. zones at full capacity: an active zone with no spot free now (HU-22, #373). Each alert brings `type` (`zone_full`), `severity`, `zoneId` and `zoneName`, and no text: the frontend writes the sentence (#313) |
| GET | `/admin/users?search=&role=&status=&page=&limit=` | Admin | List users with filters, pagination (at most 100 per page), and reservation count per user (HU-23). `search` looks for `%`, `_` and `\` as written (#304) |
| GET | `/admin/users/logs` | Admin | Last 10 role/status changes made by admins (HU-23) |
| PATCH | `/admin/users/:id/role` | Admin | Grant/revoke admin role (HU-23). Can't self-modify; keeps at least one active admin. The role it already has answers 200 and writes no line in the log (#304). An account with an `Active` reservation, a `Pending` one whose 15 minutes to pay are still running, or a balance to pay answers 409 `USER_HAS_OPEN_RESERVATIONS` (#348). Both accounts (the admin and the one changed) are locked first, in the order of their id; if the other admin deactivated this one or removed its role meanwhile, 403 `ACCOUNT_DEACTIVATED` or `FORBIDDEN_ROLE` |
| PATCH | `/admin/users/:id/status` | Admin | Activate/deactivate an account (HU-23). Same protections as above. The status it already has answers 200 and writes no line in the log (#304). Deactivating has the same 409 `USER_HAS_OPEN_RESERVATIONS` (#348); activating is never blocked |

### Dashboard ranges (HU-22)

The `range` of the dashboard endpoints is `today`, `week` or `month`. It is
`today` when it is missing, and any other value answers 400 `INVALID_RANGE`.
Every range ends at the moment of the request and starts at midnight
(12:00 a. m.) in Colombia time, whatever the time zone of the server:

| `range` | Name on the screen | Starts at midnight of |
|---|---|---|
| `today` | Hoy | today |
| `week` | Últimos 7 días | 6 days ago (today and the 6 days before) |
| `month` | Últimos 30 días | 29 days ago (today and the 29 days before) |

- They are rolling days, not calendar periods: `week` does not start on
  Monday and `month` does not start on day 1.
- What each endpoint compares with the range: active reservations that
  overlap it, revenue by payment date (`paidAt`), reservations per zone by
  start time, and payments by status by creation date.
- Active zones, registered users, occupancy, recent payments and alerts
  show the situation right now and do not change with the range.

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
  creation, and from then their spot is free for their hours (HU-26).
  Until then they can be paid or cancelled, even if their start time has
  passed (#316).
  The job runs every minute, but the 15 minutes decide: from that moment
  paying or cancelling answers 400 `RESERVATION_EXPIRED`, even if the job
  has not marked the reservation `Expired` yet (#347).
- Paid (`Active`) reservations are automatically marked `Finished` once
  their end time passes. Their spot is free 10 minutes after that time,
  before and after the job runs (#373).
- An open stay keeps a provisional exit time: entry + 24 hours, or the
  closing time of its zone (HU-29). If it is not finished by then, it
  closes automatically, the hours up to that time are charged and what was
  not paid stays as a pending balance (HU-27).
- Until a pending balance is paid, the user cannot make new reservations.
- Every user has two limits, each answered with a 409 and its own code: at
  most 2 reservations in `Pending` at the same time
  (`TOO_MANY_PENDING_RESERVATIONS`) and at most 5 active vehicles
  (`VEHICLE_LIMIT_REACHED`). Both are checked in the same transaction that
  locks the row of the user, so two requests at the same moment cannot go
  over either limit (#299).
- Every role/status change made through the admin endpoints is recorded
  in an internal audit log (`GET /admin/users/logs`).
- The primary administrator account can never be deactivated or have its
  role revoked, by anyone, including itself.
