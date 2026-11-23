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
        const password = randomUUID();
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
            expect.objectContaining({ id: admin.id, email }),
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
            expect.objectContaining({ id: admin.id, email: 'admin@parkea.com' }),
            {}
        );
    });
});
