const express = require('express');
const request = require('supertest');
const { validateRegister } = require('../src/middlewares/auth.validator');
const { validarEditarPerfil } = require('../src/middlewares/usuario.validator');

// #312: the sign-up and Mi perfil use the rules of utils/personRules.js. Each
// validator runs alone in a small app that answers with the body it got, so
// the tests see what would reach the controller and be saved.
const appWith = (validator) => {
    const app = express();
    app.use(express.json());
    app.post('/check', validator, (req, res) => res.json(req.body));
    return app;
};

const VALID_SIGN_UP = {
    fullName: "Ana María Pérez-O'Neil",
    email: 'ana@correo.test',
    password: 'Clave123*',
    confirmPassword: 'Clave123*',
    phone: '3001234567',
    documentType: 'CC',
    documentNumber: '1012345678',
};

// The fields that failed, as the frontend reads them (errors[].path)
const failedFields = (res) => [...new Set(res.body.errors.map((error) => error.path))];

describe('Sign-up: full name and phone (#312)', () => {
    const app = appWith(validateRegister);

    test('accepts the examples of the card and saves the name without extra spaces', async () => {
        // Act
        const res = await request(app).post('/check').send({ ...VALID_SIGN_UP, fullName: "  Ana   María Pérez-O'Neil ", phone: ' 3001234567 ' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.fullName).toBe("Ana María Pérez-O'Neil");
        expect(res.body.phone).toBe('3001234567');
    });

    test('saves a name written with a special font as normal letters', async () => {
        // Act
        const res = await request(app).post('/check').send({ ...VALID_SIGN_UP, fullName: '𝓐𝓷𝓪 Ｐé𝓻𝓮𝔃' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.fullName).toBe('Ana Pérez');
    });

    test.each([
        ['12345 @@@', 'the example of the card'],
        ['Ana1', 'a digit'],
        ['A', 'only 1 letter'],
        ['Ana-', 'it ends with a hyphen'],
        ['A'.repeat(71), '71 letters'],
    ])('rejects the name "%s" (%s) with VALIDATION_ERROR on fullName', async (fullName) => {
        // Act
        const res = await request(app).post('/check').send({ ...VALID_SIGN_UP, fullName });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(failedFields(res)).toEqual(['fullName']);
    });

    test.each([
        ['0000000000', 'the example of the card'],
        ['2001234567', 'it does not start with 3'],
        ['300123456', '9 digits'],
    ])('rejects the phone "%s" (%s) with VALIDATION_ERROR on phone', async (phone) => {
        // Act
        const res = await request(app).post('/check').send({ ...VALID_SIGN_UP, phone });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(failedFields(res)).toEqual(['phone']);
    });

    test.each([
        ['fullName', 'Full name is required'],
        ['phone', 'Phone is required'],
    ])('only says that %s is required when it is missing', async (field, message) => {
        // Arrange
        const body = { ...VALID_SIGN_UP };
        delete body[field];

        // Act
        const res = await request(app).post('/check').send(body);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.errors.map((error) => error.msg)).toEqual([message]);
    });
});

describe('Mi perfil: full name and phone (#312)', () => {
    const app = appWith(validarEditarPerfil);

    test('accepts a valid name and phone and saves them without extra spaces', async () => {
        // Act
        const res = await request(app).post('/check').send({ fullName: ' Ana  Pérez ', phone: ' 3001234567 ' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ fullName: 'Ana Pérez', phone: '3001234567' });
    });

    test('accepts a change of only the name, without the phone', async () => {
        // Act
        const res = await request(app).post('/check').send({ fullName: 'Ana Pérez' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ fullName: 'Ana Pérez' });
    });

    test('only says that the name is required when it is empty', async () => {
        // Act
        const res = await request(app).post('/check').send({ fullName: '   ' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.errors.map((error) => error.msg)).toEqual(['Full name is required']);
    });

    test.each([
        [{ fullName: '12345 @@@' }, 'fullName'],
        [{ phone: '0000000000' }, 'phone'],
        [{ phone: '' }, 'phone'],
    ])('rejects %p with VALIDATION_ERROR on %s', async (body, field) => {
        // Act
        const res = await request(app).post('/check').send(body);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(failedFields(res)).toEqual([field]);
    });
});
