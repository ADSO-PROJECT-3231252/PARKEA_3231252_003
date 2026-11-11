import { translateError } from '../src/utils/errorMessages';

const GENERIC = 'Ocurrió un error inesperado. Intenta de nuevo';

describe('translateError', () => {
    test('returns the Spanish text of a known code', () => {
        // Arrange
        const code = 'INVALID_CREDENTIALS';
        // Act
        const message = translateError(code);
        // Assert
        expect(message).toBe('Correo o contraseña incorrectos');
    });

    test.each([
        ['EMAIL_ALREADY_REGISTERED', 'Este correo ya está registrado'],
        ['VEHICLE_HAS_ACTIVE_RESERVATION', 'Este vehículo tiene una reserva activa. Cancélala antes de eliminarlo'],
        ['TOO_MANY_REQUESTS', 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo'],
        ['NO_SPOTS_AVAILABLE', 'Este cupo ya no está disponible. Elige otra zona u horario'],
        ['EMAIL_NOT_VERIFIED', 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada'],
        ['VERIFICATION_TOKEN_INVALID', 'Este enlace de confirmación ya no es válido. Pide uno nuevo'],
    ])('translates %s', (code, text) => {
        expect(translateError(code)).toBe(text);
    });

    test('returns the generic message for INTERNAL_ERROR', () => {
        expect(translateError('INTERNAL_ERROR')).toBe(GENERIC);
    });

    test.each(['SOMETHING_NEW', '', undefined, null])('returns the generic message for an unknown code (%p)', (code) => {
        expect(translateError(code)).toBe(GENERIC);
    });

    test('does not match by the English message', () => {
        expect(translateError('Invalid credentials')).toBe(GENERIC);
    });
});
