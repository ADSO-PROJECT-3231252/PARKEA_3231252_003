-- Create database
CREATE DATABASE IF NOT EXISTS parkea_db;
USE parkea_db;

-- 1. Table: roles
CREATE TABLE roles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name ENUM('admin', 'user') NOT NULL UNIQUE
);

-- 2. Table: users
-- Relation: roles (1) - (N) users
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 3. Table: vehicles
-- Relation: users (1) - (N) vehicles
CREATE TABLE vehicles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    plate VARCHAR(20) NOT NULL UNIQUE,
    brand VARCHAR(50),
    model VARCHAR(50),
    color VARCHAR(30),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Table: zones
CREATE TABLE zones (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    total_slots INT NOT NULL DEFAULT 0,
    available_slots INT NOT NULL CHECK (available_slots >= 0),
    hourly_rate DECIMAL(10,2) NOT NULL CHECK (hourly_rate >= 0)
);

