-- PARKEA (SIGMUI) — Official database schema
-- Written from a database built with the Sequelize migrations in
-- backend/src/migrations (32 migrations, up to
-- 20261123100200-require-api-required-columns), with SHOW CREATE TABLE, so it
-- has the same tables, columns, defaults, indexes, foreign keys and CHECK
-- constraints. The application's database is created with those migrations
-- and seeders (see README); this file is the readable reference of the same
-- design, and the comments explain each table.

CREATE DATABASE IF NOT EXISTS parkea_db;
USE parkea_db;

-- 1. Table: roles
CREATE TABLE `roles` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `name` enum('admin','user') NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Table: users
-- Relation: roles (1) - (N) users
-- Accounts are deactivated with is_active = FALSE instead of being deleted.
-- The only exception is an account that was never verified (HU-30): once its
-- links have expired, a new sign-up with the same document deletes it (it
-- never signed in, so it has no vehicles or reservations). If an
-- administrator action names it, it only loses the document
-- email_verified_at: NULL until the user opens the link of the verification
-- email, or sets a new password with a recovery link (HU-30); an account that
-- is not verified cannot sign in. Accounts created before HU-30 and the
-- administrator of the seeders are verified
-- password_version goes up on every password change, and a session token
-- issued with an older version stops working (#199)
-- document_number can be NULL only for that case; phone can be NULL because
-- the administrator of the seeders has none (#372)
CREATE TABLE `users` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `full_name` varchar(100) NOT NULL,
    `email` varchar(150) NOT NULL,
    `password` varchar(255) NOT NULL,
    `phone` varchar(20) DEFAULT NULL,
    `role_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `created_at` datetime NOT NULL,
    `document_type` enum('CC','TI','CE','PASSPORT') NOT NULL,
    `document_number` varchar(20) DEFAULT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT '1',
    `is_primary_admin` tinyint(1) NOT NULL DEFAULT '0',
    `email_verified_at` datetime DEFAULT NULL,
    `password_version` int NOT NULL DEFAULT '0',
    PRIMARY KEY (`id`),
    UNIQUE KEY `email` (`email`),
    UNIQUE KEY `users_document_number_unique` (`document_number`),
    KEY `role_id` (`role_id`),
    CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Table: vehicles
-- Relation: users (1) - (N) vehicles
-- Soft delete: deleted_at is set instead of removing the row, so the booking
-- history keeps showing the correct plate
-- plate_active is NULL for deleted vehicles and MySQL allows several NULLs in
-- a unique index, so a plate is unique only among vehicles that are not
-- deleted: the plate of a deleted vehicle can be registered again (HU-10, AC-04)
CREATE TABLE `vehicles` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `plate` varchar(20) NOT NULL,
    `brand` varchar(50) NOT NULL,
    `model` varchar(50) NOT NULL,
    `color` varchar(30) NOT NULL,
    `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `vehicle_type` enum('car','motorcycle','truck') NOT NULL DEFAULT 'car',
    `visual_description` varchar(255) DEFAULT NULL,
    `is_default` tinyint(1) NOT NULL DEFAULT '0',
    `deleted_at` datetime DEFAULT NULL,
    `created_at` datetime NOT NULL,
    `plate_active` varchar(20) GENERATED ALWAYS AS (if((`deleted_at` is null),`plate`,NULL)) STORED,
    PRIMARY KEY (`id`),
    UNIQUE KEY `vehicles_plate_active_unique` (`plate_active`),
    KEY `user_id` (`user_id`),
    CONSTRAINT `vehicles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Table: zones
-- Coordinates are required to locate the zone on a map (HU-25)
-- Zones are never deleted: they are deactivated with is_active = FALSE
-- open_24h: TRUE for a zone open 24 hours, FALSE when its hours are in
-- zone_schedules (HU-29). Zones created before HU-29 are open 24 hours
-- The free spots are not stored: they depend on the hours asked, and the API
-- calculates them from the reservations (#373)
-- hourly_rate must be greater than 0 (CHECK zones_hourly_rate_positive, #372)
CREATE TABLE `zones` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `name` varchar(100) NOT NULL,
    `address` varchar(255) NOT NULL,
    `total_slots` int NOT NULL DEFAULT '0',
    `hourly_rate` decimal(10,2) NOT NULL,
    `latitude` decimal(10,7) NOT NULL,
    `longitude` decimal(10,7) NOT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT '1',
    `open_24h` tinyint(1) NOT NULL DEFAULT '1',
    PRIMARY KEY (`id`),
    CONSTRAINT `zones_hourly_rate_positive` CHECK ((`hourly_rate` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Table: zone_schedules
-- Relation: zones (1) - (N) zone_schedules
-- The hours of a zone that is not open 24 hours (HU-29): one row for each day
-- the zone opens, in Colombia time (1 = Monday ... 7 = Sunday). A day without
-- a row is a closed day. The hours never cross midnight (the latest closing
-- time is 23:59), have no seconds, and the zone opens at least 30 minutes
-- before it closes
-- New hours apply to new reservations and extensions: the reservations that
-- already exist keep their times
-- The four rules above are the CHECKs of this table (#372)
CREATE TABLE `zone_schedules` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `zone_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `day_of_week` tinyint NOT NULL,
    `opens_at` time NOT NULL,
    `closes_at` time NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `zone_schedules_zone_day_unique` (`zone_id`,`day_of_week`),
    CONSTRAINT `zone_schedules_ibfk_1` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`) ON DELETE CASCADE,
    CONSTRAINT `zone_schedules_day_of_week_range` CHECK ((`day_of_week` between 1 and 7)),
    CONSTRAINT `zone_schedules_open_30_minutes` CHECK (((time_to_sec(`closes_at`) - time_to_sec(`opens_at`)) >= (30 * 60))),
    CONSTRAINT `zone_schedules_times_in_day` CHECK (((`opens_at` >= '00:00:00') and (`closes_at` <= '23:59:00'))),
    CONSTRAINT `zone_schedules_whole_minutes` CHECK (((second(`opens_at`) = 0) and (second(`closes_at`) = 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Table: parking_spots
-- Relation: zones (1) - (N) parking_spots
-- One row per physical spot. Created automatically (1..total_slots) when a
-- zone is created, and adjusted when its capacity changes. Spots are never
-- deleted — a spot that no longer fits the zone's capacity is Disabled
-- instead, so reservation history keeps its reference intact. A spot is
-- taken only for the hours of its reservations (#373), so its status only
-- says whether it can be reserved.
CREATE TABLE `parking_spots` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `zone_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `spot_number` int NOT NULL,
    `status` enum('Available','Disabled') NOT NULL DEFAULT 'Available',
    PRIMARY KEY (`id`),
    UNIQUE KEY `parking_spots_zone_spot_unique` (`zone_id`,`spot_number`),
    CONSTRAINT `parking_spots_ibfk_1` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 7. Table: reservations
-- Relations: users (1) - (N) | zones (1) - (N) | vehicles (1) - (N) | parking_spots (1) - (N)
-- parking_spot_id links the reservation to the exact physical spot assigned
-- automatically at booking time (spot_number is kept as a denormalized
-- copy for quick display, sourced from the assigned spot)
-- applied_hourly_rate freezes the zone rate at booking time, so later rate
-- changes never alter the price of an existing reservation
-- hold_expires_at: an unpaid reservation expires and releases its spot (HU-26)
-- A reservation holds its spot only for its hours, while it is Active or
-- Pending with its 15 minutes still running; the index finds the
-- reservations of a spot by status and time, and it is also the index of
-- the foreign key of parking_spot_id (#373)
-- open_ended: a stay without a chosen exit time (HU-27). Its end_time keeps a
-- provisional value until the stay ends: entry + 24 h, or the closing time of
-- that day when the zone is not open 24 hours (HU-29). This flag is what
-- tells it apart from a reservation with an exit time
-- Foreign keys use RESTRICT so removing a user, zone, vehicle, or spot can
-- never destroy the booking history
-- The two jobs find, every minute, the Pending reservations whose 15 minutes
-- ended and the Active ones whose time ended, with the indexes on status and
-- hold_expires_at and on status and end_time (#372)
-- applied_hourly_rate has no default: a reservation without its rate fails
-- instead of charging nothing (#372)
CREATE TABLE `reservations` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `zone_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `vehicle_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `start_time` datetime NOT NULL,
    `end_time` datetime NOT NULL,
    `spot_number` int NOT NULL,
    `status` enum('Pending','Active','Finished','Cancelled','Expired') NOT NULL DEFAULT 'Pending',
    `hold_expires_at` datetime DEFAULT NULL,
    `applied_hourly_rate` decimal(10,2) NOT NULL,
    `parking_spot_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
    `open_ended` tinyint(1) NOT NULL DEFAULT '0',
    PRIMARY KEY (`id`),
    KEY `reservations_vehicle_id_fk` (`vehicle_id`),
    KEY `reservations_user_id_fk` (`user_id`),
    KEY `reservations_zone_id_fk` (`zone_id`),
    KEY `reservations_spot_status_times_idx` (`parking_spot_id`,`status`,`start_time`,`end_time`),
    KEY `reservations_status_hold_expires_at_idx` (`status`,`hold_expires_at`),
    KEY `reservations_status_end_time_idx` (`status`,`end_time`),
    CONSTRAINT `reservations_parking_spot_id_foreign_idx` FOREIGN KEY (`parking_spot_id`) REFERENCES `parking_spots` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `reservations_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `reservations_vehicle_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `reservations_zone_id_fk` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
-- amount is never negative (CHECK payments_amount_not_negative, SRS 3.5, #372)
CREATE TABLE `payments` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `reservation_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `amount` decimal(10,2) NOT NULL,
    `payment_status` enum('Pending','Paid','Cancelled','Refunded') NOT NULL DEFAULT 'Pending',
    `payment_method` enum('card','pse') DEFAULT NULL,
    `card_last_four` varchar(4) DEFAULT NULL,
    `paid_at` datetime DEFAULT NULL,
    `created_at` datetime NOT NULL,
    `type` enum('initial','extension','balance') NOT NULL DEFAULT 'initial',
    `initial_reservation_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin GENERATED ALWAYS AS (if((`type` = _utf8mb4'initial'),rtrim(`reservation_id`),NULL)) STORED,
    PRIMARY KEY (`id`),
    UNIQUE KEY `payments_initial_reservation_unique` (`initial_reservation_id`),
    KEY `payments_reservation_id` (`reservation_id`),
    CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`),
    CONSTRAINT `payments_amount_not_negative` CHECK ((`amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 9. Table: password_reset_tokens
-- Relation: users (1) - (N) password_reset_tokens
-- Single-use tokens, valid for one hour (HU-07)
-- Only the hash of the token is stored, never the token itself
-- A new link, a reset or a password change from the profile marks the other
-- links of the account as used (#199)
-- Opening a link looks the hash up in its index (#372)
CREATE TABLE `password_reset_tokens` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `token_hash` varchar(255) NOT NULL,
    `expires_at` datetime NOT NULL,
    `used_at` datetime DEFAULT NULL,
    `created_at` datetime NOT NULL,
    PRIMARY KEY (`id`),
    KEY `user_id` (`user_id`),
    KEY `password_reset_tokens_token_hash_idx` (`token_hash`),
    CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 10. Table: email_verification_tokens
-- Relation: users (1) - (N) email_verification_tokens
-- Links of the verification email (HU-30): single-use, valid for 24 hours. A
-- new link marks the previous ones as used, so only the newest one works. A
-- new password set with a recovery link also marks them as used
-- Only the SHA-256 hash of the token is stored (64 characters), never the
-- token itself; opening a link looks the hash up in the unique index
CREATE TABLE `email_verification_tokens` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `token_hash` varchar(64) NOT NULL,
    `expires_at` datetime NOT NULL,
    `used_at` datetime DEFAULT NULL,
    `created_at` datetime NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `email_verification_tokens_token_hash` (`token_hash`),
    KEY `user_id` (`user_id`),
    CONSTRAINT `email_verification_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 11. Table: admin_action_logs
-- Relation: users (1) - (N) admin_action_logs, twice (admin and target)
-- Audit trail of role and account-status changes made by administrators
-- (HU-23, AC-14). RESTRICT keeps the trail even if an account is removed
CREATE TABLE `admin_action_logs` (
    `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `admin_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `target_user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `action` enum('role_changed','status_changed') NOT NULL,
    `details` varchar(255) NOT NULL,
    `created_at` datetime NOT NULL,
    PRIMARY KEY (`id`),
    KEY `admin_id` (`admin_id`),
    KEY `target_user_id` (`target_user_id`),
    KEY `admin_action_logs_created_at_idx` (`created_at`),
    CONSTRAINT `admin_action_logs_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `admin_action_logs_ibfk_2` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
