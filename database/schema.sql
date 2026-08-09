-- PARKEA (SIGMUI) — Official database schema
-- Mirrors the Sequelize migrations in backend/src/migrations

CREATE DATABASE IF NOT EXISTS parkea_db;
USE parkea_db;

-- 1. Table: roles
CREATE TABLE roles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name ENUM('admin', 'user') NOT NULL UNIQUE
);

-- 2. Table: users
-- Relation: roles (1) - (N) users
-- Accounts are never deleted: they are deactivated with is_active = FALSE
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 3. Table: vehicles
-- Relation: users (1) - (N) vehicles
-- Soft delete: deleted_at is set instead of removing the row, so the booking
-- history keeps showing the correct plate
CREATE TABLE vehicles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    plate VARCHAR(20) NOT NULL UNIQUE,
    vehicle_type ENUM('car', 'motorcycle', 'truck') NOT NULL DEFAULT 'car',
    brand VARCHAR(50),
    model VARCHAR(50),
    color VARCHAR(30),
    visual_description VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Table: zones
-- Coordinates are required to locate the zone on a map (HU-25)
-- Zones are never deleted: they are deactivated with is_active = FALSE
CREATE TABLE zones (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    total_slots INT NOT NULL DEFAULT 0,
    available_slots INT NOT NULL CHECK (available_slots >= 0),
    hourly_rate DECIMAL(10,2) NOT NULL CHECK (hourly_rate >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. Table: parking_spots
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

-- 6. Table: reservations
-- Relations: users (1) - (N) | zones (1) - (N) | vehicles (1) - (N) | parking_spots (1) - (N)
-- parking_spot_id links the reservation to the exact physical spot assigned
-- automatically at booking time (spot_number is kept as a denormalized
-- copy for quick display, sourced from the assigned spot)
-- applied_hourly_rate freezes the zone rate at booking time, so later rate
-- changes never alter the price of an existing reservation
-- hold_expires_at: an unpaid reservation expires and releases its spot (HU-26)
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
    CONSTRAINT reservations_user_id_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT reservations_zone_id_fk FOREIGN KEY (zone_id)
        REFERENCES zones(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT reservations_vehicle_id_fk FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT reservations_parking_spot_id_fk FOREIGN KEY (parking_spot_id)
        REFERENCES parking_spots(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 7. Table: payments
-- Relation: reservations (1) - (1) payments (enforced with UNIQUE)
-- The full card number is never stored, only the last four digits
CREATE TABLE payments (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    reservation_id VARCHAR(36) NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    payment_status ENUM('Pending', 'Paid', 'Cancelled', 'Refunded')
        NOT NULL DEFAULT 'Pending',
    payment_method ENUM('card', 'pse'),
    card_last_four VARCHAR(4),
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- 8. Table: password_reset_tokens
-- Single-use tokens, valid for one hour (HU-07)
-- Only the hash of the token is stored, never the token itself
CREATE TABLE password_reset_tokens (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);