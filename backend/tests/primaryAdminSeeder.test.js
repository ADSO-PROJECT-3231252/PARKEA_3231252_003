const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const express = require('express');
const request = require('supertest');
const seeder = require('../src/seeders/20260808234824-demo-primary-admin');
const { validateRegister, validateLogin } = require('../src/middlewares/auth.validator');

const EMAIL_ERROR = 'PRIMARY_ADMIN_EMAIL must be a valid email of at most 100 characters.';
const PASSWORD_ERROR =
    'PRIMARY_ADMIN_PASSWORD must have 8 to 20 characters, an uppercase letter, a number and a special character.';

// The sign-up and the sign-in run alone in a small app, as in personValidation.test.js
const appWith = (validator) => {
    const app = express();
    app.use(express.json());
    app.post('/check', validator, (req, res) => res.json(req.body));
    return app;
};
const SIGN_UP = {
    fullName: 'Ana Pérez',
    email: 'ana@correo.test',
    password: 'Clave123*',
    confirmPassword: 'Clave123*',
    phone: '3001234567',
    documentType: 'CC',
    documentNumber: '1012345678',
};
const failedFields = (res) => (res.status === 200 ? [] : res.body.errors.map((error) => error.path));

describe('Primary administrator seeder (#370)', () => {
    let queryInterface;

    beforeEach(() => {
        jest.replaceProperty(process, 'env', { ...process.env });
        delete process.env.PRIMARY_ADMIN_EMAIL;
        delete process.env.PRIMARY_ADMIN_PASSWORD;
        delete process.env.SEED_DEMO_ADMIN;

        queryInterface = {
            sequelize: {
                config: { host: '127.0.0.1' },
                query: jest.fn().mockResolvedValue([[{ id: 'admin-role-id' }]]),
            },
            bulkInsert: jest.fn(),
            bulkDelete: jest.fn(),
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('stops without creating an administrator when credentials and demo mode are missing', async () => {
        await expect(seeder.up(queryInterface)).rejects.toThrow(
            'Set PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD'
        );
        expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
    });

    test.each(['email', 'password'])(
        'rejects a configuration with only the %s, even when demo mode is enabled',
        async (field) => {
            process.env.SEED_DEMO_ADMIN = 'true';
            if (field === 'email') {
                process.env.PRIMARY_ADMIN_EMAIL = 'admin@example.test';
            } else {
                process.env.PRIMARY_ADMIN_PASSWORD = randomUUID();
            }

            await expect(seeder.up(queryInterface)).rejects.toThrow(
                'Set both PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD'
            );
            expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        }
    );

    test('uses the configured credentials even when demo mode is enabled', async () => {
        const email = 'admin@example.test';
        // A random password that follows the rule of the sign-up
        const password = `Aa1!${randomUUID().slice(0, 12)}`;
        process.env.PRIMARY_ADMIN_EMAIL = email;
        process.env.PRIMARY_ADMIN_PASSWORD = password;
        process.env.SEED_DEMO_ADMIN = 'true';

        await seeder.up(queryInterface);

        expect(queryInterface.bulkInsert).toHaveBeenCalledWith('users', [
            expect.objectContaining({
                email,
                role_id: 'admin-role-id',
                is_primary_admin: true,
            }),
        ]);
        const [admin] = queryInterface.bulkInsert.mock.calls[0][1];
        expect(await bcrypt.compare(password, admin.password)).toBe(true);

        await seeder.down(queryInterface);

        expect(queryInterface.bulkDelete).toHaveBeenCalledWith(
            'users',
            { id: admin.id, email, is_primary_admin: true },
            {}
        );
    });

    test('creates and removes the local demo administrator in explicit demo mode', async () => {
        process.env.SEED_DEMO_ADMIN = 'true';

        await seeder.up(queryInterface);

        expect(queryInterface.bulkInsert).toHaveBeenCalledWith('users', [
            expect.objectContaining({
                email: 'admin@parkea.com',
                is_primary_admin: true,
            }),
        ]);
        const [admin] = queryInterface.bulkInsert.mock.calls[0][1];

        await seeder.down(queryInterface);

        expect(queryInterface.bulkDelete).toHaveBeenCalledWith(
            'users',
            { id: admin.id, email: 'admin@parkea.com', is_primary_admin: true },
            {}
        );
    });

    test.each(['false', 'TRUE', '1', ' true', ''])(
        'does not take SEED_DEMO_ADMIN=%p as demo mode',
        async (value) => {
            process.env.SEED_DEMO_ADMIN = value;

            await expect(seeder.up(queryInterface)).rejects.toThrow('db:seed --seed 20260808234824-demo-primary-admin.js');
            expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        }
    );

    test('does not seed the demo administrator in a database of another computer', async () => {
        process.env.SEED_DEMO_ADMIN = 'true';
        queryInterface.sequelize.config.host = 'parkea-db.mysql.database.azure.com';

        await expect(seeder.up(queryInterface)).rejects.toThrow(
            'SEED_DEMO_ADMIN=true only seeds a local database, not parkea-db.mysql.database.azure.com'
        );
        expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
    });

    test.each(['localhost', '127.0.0.1', '::1'])('seeds the demo administrator in a database at %s', async (host) => {
        process.env.SEED_DEMO_ADMIN = 'true';
        queryInterface.sequelize.config.host = host;

        await seeder.up(queryInterface);

        expect(queryInterface.bulkInsert).toHaveBeenCalledTimes(1);
    });

    test('trims the configured email', async () => {
        process.env.PRIMARY_ADMIN_EMAIL = '  admin@example.test  ';
        process.env.PRIMARY_ADMIN_PASSWORD = 'Admin#2026';

        await seeder.up(queryInterface);

        expect(queryInterface.bulkInsert.mock.calls[0][1][0].email).toBe('admin@example.test');
    });

    test.each(['administrador', 'admin@parkeaweb', 'admin @parkeaweb.me'])(
        'rejects the configured email %p',
        async (email) => {
            process.env.PRIMARY_ADMIN_EMAIL = email;
            process.env.PRIMARY_ADMIN_PASSWORD = 'Admin#2026';

            await expect(seeder.up(queryInterface)).rejects.toThrow(EMAIL_ERROR);
            expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        }
    );

    test.each([
        ['shorter than 8 characters', 'Ad#2026'],
        ['longer than 20 characters', 'Admin#2026-Admin#2026'],
        ['without an uppercase letter', 'admin#2026'],
        ['without a number', 'Admin#Parkea'],
        ['without a special character', 'Admin2026'],
        ['made of spaces', '          '],
    ])('rejects a configured password %s', async (_case, password) => {
        process.env.PRIMARY_ADMIN_EMAIL = 'admin@example.test';
        process.env.PRIMARY_ADMIN_PASSWORD = password;

        await expect(seeder.up(queryInterface)).rejects.toThrow(PASSWORD_ERROR);
        expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
    });

    test('accepts a configured password of exactly 8 and of exactly 20 characters', async () => {
        process.env.PRIMARY_ADMIN_EMAIL = 'admin@example.test';
        for (const password of ['Admin#20', 'Admin#2026-Admin#202']) {
            process.env.PRIMARY_ADMIN_PASSWORD = password;
            await seeder.up(queryInterface);
        }

        expect(queryInterface.bulkInsert).toHaveBeenCalledTimes(2);
    });

    // The seeder runs the rules of the sign-up, so it accepts exactly what the
    // sign-up accepts, and the administrator can always sign in
    describe('the same rules as the sign-up and the sign-in', () => {
        const signUp = appWith(validateRegister);
        const signIn = appWith(validateLogin);

        // Did the seeder create the administrator with these values?
        const seederAccepts = async (email, password) => {
            process.env.PRIMARY_ADMIN_EMAIL = email;
            process.env.PRIMARY_ADMIN_PASSWORD = password;
            const error = await seeder.up(queryInterface).then(() => null, (thrown) => thrown);
            if (error && ![EMAIL_ERROR, PASSWORD_ERROR].includes(error.message)) throw error;
            return !error && queryInterface.bulkInsert.mock.calls.length === 1;
        };

        test.each([
            ['two..dots@example.test', false],
            ['.admin@example.test', false],
            ['admin@parkeaweb.me.', false],
            ['admin@-parkeaweb.me', false],
            ['admin@parkeaweb.m', false],
            [`${'a'.repeat(60)}@${'b'.repeat(36)}.com`, false],
            [`${'a'.repeat(60)}@${'b'.repeat(35)}.com`, true],
            ['"team admin"@parkeaweb.me', true],
            ['Admin@ParkeaWeb.me', true],
            ['admin@parkeaweb.me', true],
        ])('email %p: accepted %p, as in the sign-up', async (email, accepted) => {
            // Act
            const seeded = await seederAccepts(email, 'Admin#2026');
            const signUpRes = await request(signUp).post('/check').send({ ...SIGN_UP, email });
            const signInRes = await request(signIn).post('/check').send({ email, password: 'Admin#2026' });

            // Assert
            expect(seeded).toBe(accepted);
            expect(failedFields(signUpRes).includes('email')).toBe(!accepted);
            if (accepted) {
                expect(signInRes.status).toBe(200);
                expect(queryInterface.bulkInsert.mock.calls[0][1][0].email).toBe(email);
            }
        });

        test.each([
            // Characters are counted as the sign-up counts them: one emoji is one
            ['7 characters with an emoji', `A1!${'a'.repeat(3)}😀`, false],
            ['20 characters with an emoji', `A1!${'a'.repeat(16)}😀`, true],
            ['20 characters, 16 of them emojis', `Ab1!${'😀'.repeat(16)}`, true],
            ['21 characters, 17 of them emojis', `Ab1!${'😀'.repeat(17)}`, false],
        ])('a password of %s (%p) is accepted: %p, as in the sign-up', async (_case, password, accepted) => {
            // Act
            const seeded = await seederAccepts('admin@example.test', password);
            const signUpRes = await request(signUp)
                .post('/check')
                .send({ ...SIGN_UP, password, confirmPassword: password });

            // Assert
            expect(seeded).toBe(accepted);
            expect(failedFields(signUpRes).includes('password')).toBe(!accepted);
            if (accepted) {
                const [admin] = queryInterface.bulkInsert.mock.calls[0][1];
                expect(await bcrypt.compare(password, admin.password)).toBe(true);
            }
        });

        test('never prints the configured values in its errors', async () => {
            // Arrange: a password without an uppercase letter
            process.env.PRIMARY_ADMIN_EMAIL = 'admin@example.test';
            process.env.PRIMARY_ADMIN_PASSWORD = `secret-${randomUUID()}`;

            // Act
            const passwordError = await seeder.up(queryInterface).catch((error) => error);
            process.env.PRIMARY_ADMIN_EMAIL = 'two..dots@example.test';
            const emailError = await seeder.up(queryInterface).catch((error) => error);

            // Assert: the exact messages, so no value can be added to them
            expect(passwordError.message).toBe(PASSWORD_ERROR);
            expect(emailError.message).toBe(EMAIL_ERROR);
            expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        });
    });
});
