// Central translation table: backend error `code` → Spanish message.
// Always match by `code`, never by comparing the English `message`
// (which can change wording without notice). See backend's
// src/constants/errorCodes.js for the source of truth.

const errorMessages = {
    // Auth
    EMAIL_ALREADY_REGISTERED: 'Este correo ya está registrado',
    DOCUMENT_ALREADY_REGISTERED: 'Este número de documento ya está registrado',
    ROLE_NOT_CONFIGURED: 'Error de configuración del sistema. Contacta al administrador',
    INVALID_CREDENTIALS: 'Correo o contraseña incorrectos',
    NOT_ADMIN_ACCOUNT: 'Esta cuenta no tiene privilegios de administrador',
    NO_TOKEN: 'Debes iniciar sesión para continuar',
    INVALID_TOKEN: 'Tu sesión expiró. Inicia sesión de nuevo',
    FORBIDDEN_ROLE: 'No tienes permiso para realizar esta acción',
    RESET_TOKEN_INVALID: 'Este enlace de recuperación ya no es válido. Solicita uno nuevo',
    ACCOUNT_DEACTIVATED: 'Tu cuenta ha sido desactivada. Contacta al administrador',

    // Users / profile
    USER_NOT_FOUND: 'Usuario no encontrado',
    CURRENT_PASSWORD_INCORRECT: 'La contraseña actual es incorrecta',
    PASSWORD_UNCHANGED: 'La nueva contraseña debe ser diferente a la actual',
    CANNOT_MODIFY_SELF: 'No puedes realizar esta acción sobre tu propia cuenta',
    PRIMARY_ADMIN_PROTECTED: 'El administrador principal no puede modificarse',
    MIN_ONE_ADMIN_REQUIRED: 'El sistema debe conservar al menos un administrador activo',
    INVALID_ROLE: 'Rol inválido',
    INVALID_RANGE: 'El rango de fechas no es válido',

    // Vehicles
    VEHICLE_NOT_FOUND: 'Vehículo no encontrado',
    PLATE_ALREADY_REGISTERED: 'Esta placa ya está registrada',
    VEHICLE_HAS_ACTIVE_RESERVATION: 'Este vehículo tiene una reserva activa. Cancélala antes de eliminarlo',
    INVALID_PLATE_FORMAT: 'El formato de la placa no corresponde al tipo de vehículo seleccionado',

    // Zones
    ZONE_NOT_FOUND: 'Zona no encontrada',
    ZONE_NAME_TAKEN: 'Ya existe una zona con este nombre',
    ZONE_INACTIVE: 'Esta zona ya no acepta reservas',
    MISSING_REQUIRED_FIELDS: 'Completa todos los campos obligatorios',
    NEGATIVE_VALUE: 'Los valores no pueden ser negativos',
    INVALID_CAPACITY: 'La capacidad debe ser un número entero mayor que cero',
    INVALID_COORDINATES: 'Las coordenadas ingresadas no son válidas',
    CAPACITY_BELOW_IN_USE: 'No puedes reducir la capacidad por debajo de los cupos en uso',
    INSUFFICIENT_AVAILABLE_SPOTS: 'No hay suficientes cupos disponibles para reducir la capacidad',

    // Reservations
    START_TIME_IN_PAST: 'La hora de inicio debe ser en el futuro',
    END_BEFORE_START: 'La hora de fin debe ser posterior a la de inicio',
    INVALID_DURATION: 'La reserva debe durar entre 30 minutos y 24 horas',
    RESERVATION_TOO_FAR_AHEAD: 'Solo puedes reservar con un máximo de 48 horas de anticipación',
    VEHICLE_RESERVATION_OVERLAP: 'Este vehículo ya tiene una reserva en ese horario',
    NO_SPOTS_AVAILABLE: 'Este cupo ya no está disponible. Elige otra zona u horario',
    RESERVATION_NOT_FOUND: 'Reserva no encontrada',
    RESERVATION_ALREADY_STARTED: 'Esta reserva ya inició y no se puede cancelar',
    RESERVATION_NOT_CANCELLABLE: 'Esta reserva no se puede cancelar en su estado actual',
    RESERVATION_EXPIRED: 'Esta reserva expiró porque no se pagó a tiempo. Realiza una nueva reserva',

    // Payments
    INVALID_PAYMENT_METHOD: 'Método de pago inválido',
    CARD_DIGITS_REQUIRED: 'Ingresa los últimos 4 dígitos de la tarjeta',
    RESERVATION_NOT_OWNED: 'Esta reserva no te pertenece',
    RESERVATION_NOT_PENDING: 'Esta reserva no está pendiente de pago',
    PAYMENT_ALREADY_EXISTS: 'Esta reserva ya tiene un pago registrado',
    PAYMENT_DECLINED: 'Pago rechazado. Intenta con otro método de pago',

    // Generic
    VALIDATION_ERROR: 'Revisa los campos marcados',
    INTERNAL_ERROR: 'Ocurrió un error inesperado. Intenta de nuevo',
};

export function translateError(code) {
    return errorMessages[code] || errorMessages.INTERNAL_ERROR;
}