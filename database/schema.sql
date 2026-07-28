-- Crear la base de datos (puedes cambiar el nombre si ya tienen uno definido)
CREATE DATABASE IF NOT EXISTS parkea_db;
USE parkea_db;

-- 1. Tabla: Usuario
CREATE TABLE Usuario (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla: Vehiculo
-- Relación: Usuario (1) - (N) Vehiculo
CREATE TABLE Vehiculo (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    usuario_id VARCHAR(36) NOT NULL,
    placa VARCHAR(20) NOT NULL UNIQUE,
    marca VARCHAR(50),
    FOREIGN KEY (usuario_id) REFERENCES Usuario(id) ON DELETE CASCADE
);

-- 3. Tabla: Zona
CREATE TABLE Zona (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    nombre_zona VARCHAR(100) NOT NULL,
    cupos_disponibles INT NOT NULL CHECK (cupos_disponibles >= 0)
);

-- 4. Tabla: Reserva
-- Relaciones: Zona (1) - (N) Reserva | Usuario (1) - (N) Reserva
CREATE TABLE Reserva (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    usuario_id VARCHAR(36) NOT NULL,
    zona_id VARCHAR(36) NOT NULL,
    fecha_reserva DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(id) ON DELETE CASCADE,
    FOREIGN KEY (zona_id) REFERENCES Zona(id) ON DELETE CASCADE
);

-- 5. Tabla: Pago
-- Relación: Reserva (1) - (1) Pago (Garantizado con UNIQUE en reserva_id)
CREATE TABLE Pago (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    reserva_id VARCHAR(36) NOT NULL UNIQUE,
    monto DECIMAL(10,2) NOT NULL CHECK (monto >= 0),
    estado_pago ENUM('Pendiente', 'Pagado', 'Cancelado') NOT NULL DEFAULT 'Pendiente',
    FOREIGN KEY (reserva_id) REFERENCES Reserva(id) ON DELETE CASCADE
);