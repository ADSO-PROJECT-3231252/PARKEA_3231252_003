const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const seeder = require('../src/seeders/20260808234824-demo-primary-admin');

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

            await expect(seeder.up(queryInterface)).rejects.toThrow('PRIMARY_ADMIN_EMAIL must be a valid email.');
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

        await expect(seeder.up(queryInterface)).rejects.toThrow('PRIMARY_ADMIN_PASSWORD must have 8 to 20 characters');
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
});
