-- PARKEA (SIGMUI) — Official database schema
-- Mirrors the Sequelize migrations in backend/src/migrations (26 migrations,
-- up to 20261112090100-create-zone-schedules). The application's
-- database is created with those migrations and seeders (see README); this
-- file is the readable reference of the same design. The CHECK constraints
-- below document rules that the backend also validates.

CREATE DATABASE IF NOT EXISTS parkea_db;
USE parkea_db;

-- 1. Table: roles
CREATE TABLE roles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name ENUM('admin', 'user') NOT NULL UNIQUE
);

-- 2. Table: users
-- Relation: roles (1) - (N) users
-- Accounts are deactivated with is_active = FALSE instead of being deleted.
-- The only exception is an account that was never verified (HU-30): once its
-- links have expired, a new sign-up with the same document deletes it (it
-- never signed in, so it has no vehicles or reservations). If an
-- administrator action names it, it only loses the document
-- email_verified_at: NULL until the user opens the link of the verification
-- email (HU-30); an account that is not verified cannot sign in. Accounts
-- created before HU-30 and the administrator of the seeders are verified
-- password_version goes up on every password change, and a session token
-- issued with an older version stops working (#199)
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    document_type ENUM('CC', 'TI', 'CE', 'PASSPORT'),
    document_number VARCHAR(20) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary_admin BOOLEAN NOT NULL DEFAULT FALSE,
    role_id VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    email_verified_at DATETIME NULL,
    password_version INT NOT NULL DEFAULT 0,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 3. Table: vehicles
-- Relation: users (1) - (N) vehicles
-- Soft delete: deleted_at is set instead of removing the row, so the booking
-- history keeps showing the correct plate
-- plate_active is NULL for deleted vehicles and MySQL allows several NULLs in
-- a unique index, so a plate is unique only among vehicles that are not
-- deleted: the plate of a deleted vehicle can be registered again (HU-10, AC-04)
CREATE TABLE vehicles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    plate VARCHAR(20) NOT NULL,
    vehicle_type ENUM('car', 'motorcycle', 'truck') NOT NULL DEFAULT 'car',
    brand VARCHAR(50),
    model VARCHAR(50),
    color VARCHAR(30),
    visual_description VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    plate_active VARCHAR(20)
        GENERATED ALWAYS AS (IF(deleted_at IS NULL, plate, NULL)) STORED,
    UNIQUE KEY vehicles_plate_active_unique (plate_active),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Table: zones
-- Coordinates are required to locate the zone on a map (HU-25)
-- Zones are never deleted: they are deactivated with is_active = FALSE
-- open_24h: TRUE for a zone open 24 hours, FALSE when its hours are in
-- zone_schedules (HU-29). Zones created before HU-29 are open 24 hours
CREATE TABLE zones (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    total_slots INT NOT NULL DEFAULT 0,
    available_slots INT NOT NULL CHECK (available_slots >= 0),
    hourly_rate DECIMAL(10,2) NOT NULL CHECK (hourly_rate >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    open_24h BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. Table: zone_schedules
-- Relation: zones (1) - (N) zone_schedules
-- The hours of a zone that is not open 24 hours (HU-29): one row for each day
-- the zone opens, in Colombia time (1 = Monday ... 7 = Sunday). A day without
-- a row is a closed day. The hours never cross midnight (the latest closing
-- time is 23:59), have no seconds, and the zone opens at least 30 minutes
-- before it closes
-- New hours apply to new reservations and extensions: the reservations that
-- already exist keep their times
CREATE TABLE zone_schedules (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    zone_id VARCHAR(36) NOT NULL,
    day_of_week TINYINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    opens_at TIME NOT NULL,
    closes_at TIME NOT NULL,
    CHECK (TIME_TO_SEC(closes_at) - TIME_TO_SEC(opens_at) >= 30 * 60),
    CHECK (opens_at >= '00:00:00' AND closes_at <= '23:59:00'),
    CHECK (SECOND(opens_at) = 0 AND SECOND(closes_at) = 0),
    UNIQUE KEY zone_schedules_zone_day_unique (zone_id, day_of_week),
    FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

-- 6. Table: parking_spots
-- Relation: zones (1) - (N) parking_spots
-- One row per physical spot. Created automatically (1..total_slots) when a
-- zone is created, and adjusted when its capacity changes. Spots are never
-- deleted — a spot that no longer fits the zone's capacity is Disabled
-- instead, so reservation history keeps its reference intact.
CREATE TABLE parking_spots (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    zone_id VARCHAR(36) NOT NULL,
    spot_number INT NOT NULL,
    status ENUM('Available', 'Occupied', 'Disabled') NOT NULL DEFAULT 'Available',
    UNIQUE KEY parking_spots_zone_spot_unique (zone_id, spot_number),
    FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

-- 7. Table: reservations
-- Relations: users (1) - (N) | zones (1) - (N) | vehicles (1) - (N) | parking_spots (1) - (N)
-- parking_spot_id links the reservation to the exact physical spot assigned
-- automatically at booking time (spot_number is kept as a denormalized
-- copy for quick display, sourced from the assigned spot)
-- applied_hourly_rate freezes the zone rate at booking time, so later rate
-- changes never alter the price of an existing reservation
-- hold_expires_at: an unpaid reservation expires and releases its spot (HU-26)
-- open_ended: a stay without a chosen exit time (HU-27). Its end_time keeps a
-- provisional value until the stay ends: entry + 24 h, or the closing time of
-- that day when the zone is not open 24 hours (HU-29). This flag is what
-- tells it apart from a reservation with an exit time
-- Foreign keys use RESTRICT so removing a user, zone, vehicle, or spot can
-- never destroy the booking history
CREATE TABLE reservations (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    zone_id VARCHAR(36) NOT NULL,
    vehicle_id VARCHAR(36) NOT NULL,
    parking_spot_id VARCHAR(36) NULL,
    spot_number INT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    hold_expires_at DATETIME NULL,
    applied_hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    status ENUM('Pending', 'Active', 'Finished', 'Cancelled', 'Expired')
        NOT NULL DEFAULT 'Pending',
    open_ended BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT reservations_user_id_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT reservations_zone_id_fk FOREIGN KEY (zone_id)
        REFERENCES zones(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT reservations_vehicle_id_fk FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT reservations_parking_spot_id_fk FOREIGN KEY (parking_spot_id)
        REFERENCES parking_spots(id) ON DELETE RESTRICT
);

-- 8. Table: payments
-- Relation: reservations (1) - (N) payments
-- type: the initial payment pays the whole stay, or the first hour of an open
-- stay (HU-27); later a reservation can get extension payments (HU-28) and
-- the balance of an open stay (HU-27)
-- initial_reservation_id holds the reservation id only for the initial
-- payment (NULL for the others), so the unique index allows one initial
-- payment per reservation and any number of extensions and balances, the
-- same pattern as plate_active on vehicles
-- The full card number is never stored, only the last four digits
-- RESTRICT keeps a reservation from being deleted while it has a payment
CREATE TABLE payments (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    reservation_id VARCHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    payment_status ENUM('Pending', 'Paid', 'Cancelled', 'Refunded')
        NOT NULL DEFAULT 'Pending',
    payment_method ENUM('card', 'pse'),
    card_last_four VARCHAR(4),
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type ENUM('initial', 'extension', 'balance') NOT NULL DEFAULT 'initial',
    initial_reservation_id VARCHAR(36)
        GENERATED ALWAYS AS (IF(type = 'initial', reservation_id, NULL)) STORED,
    UNIQUE KEY payments_initial_reservation_unique (initial_reservation_id),
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE RESTRICT
);

-- 9. Table: password_reset_tokens
-- Relation: users (1) - (N) password_reset_tokens
-- Single-use tokens, valid for one hour (HU-07)
-- Only the hash of the token is stored, never the token itself
-- A new link, a reset or a password change from the profile marks the other
-- links of the account as used (#199)
CREATE TABLE password_reset_tokens (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. Table: email_verification_tokens
-- Relation: users (1) - (N) email_verification_tokens
-- Links of the verification email (HU-30): single-use, valid for 24 hours. A
-- new link marks the previous ones as used, so only the newest one works
-- Only the SHA-256 hash of the token is stored (64 characters), never the
-- token itself; opening a link looks the hash up in the unique index
CREATE TABLE email_verification_tokens (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY email_verification_tokens_token_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 11. Table: admin_action_logs
-- Relation: users (1) - (N) admin_action_logs, twice (admin and target)
-- Audit trail of role and account-status changes made by administrators
-- (HU-23, AC-14). RESTRICT keeps the trail even if an account is removed
CREATE TABLE admin_action_logs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    admin_id VARCHAR(36) NOT NULL,
    target_user_id VARCHAR(36) NOT NULL,
    action ENUM('role_changed', 'status_changed') NOT NULL,
    details VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX admin_action_logs_created_at_idx (created_at),
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
