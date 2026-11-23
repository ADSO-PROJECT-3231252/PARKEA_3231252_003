'use strict';

const bcrypt = require('bcrypt');

const PRIMARY_ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const DEMO_EMAIL = 'admin@parkea.com';

// Hash of the existing local demo password. Used only in explicit demo mode.
const DEMO_PASSWORD_HASH =
  '$2b$10$5gotC6tBCUjfY/bWneUwCuSJrTUb4uh8/jOYOau6doqExaHOSiDMG';

// The same password rule as the sign-up (auth.validator.js), so the
// administrator can later change it with the same screens
const PASSWORD_RULES = [/^.{8,20}$/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The demo password is public, so demo mode only seeds a database of this
// computer: a hosted one always gets its own credentials
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const MISSING = 'Set PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD, or set SEED_DEMO_ADMIN=true for a local demo. '
  + 'Then run only this seeder: npx sequelize-cli db:seed --seed 20260808234824-demo-primary-admin.js';

function getAdminConfig(queryInterface) {
  const email = process.env.PRIMARY_ADMIN_EMAIL?.trim();
  const password = process.env.PRIMARY_ADMIN_PASSWORD;

  if (email && password) {
    if (!EMAIL_FORMAT.test(email)) {
      throw new Error('PRIMARY_ADMIN_EMAIL must be a valid email.');
    }
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      throw new Error(
        'PRIMARY_ADMIN_PASSWORD must have 8 to 20 characters, an uppercase letter, a number and a special character.'
      );
    }
    return { email, password };
  }

  if (email || password) {
    throw new Error(
      'Set both PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD.'
    );
  }

  if (process.env.SEED_DEMO_ADMIN === 'true') {
    const { host } = queryInterface.sequelize.config;
    if (!LOCAL_HOSTS.includes(host)) {
      throw new Error(
        `SEED_DEMO_ADMIN=true only seeds a local database, not ${host}: set PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD.`
      );
    }
    return { email: DEMO_EMAIL };
  }

  throw new Error(MISSING);
}

module.exports = {
  async up(queryInterface) {
    const { email, password } = getAdminConfig(queryInterface);

    const [roles] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'admin' LIMIT 1;"
    );
    const adminRoleId = roles[0].id;

    const passwordHash = password
      ? await bcrypt.hash(password, 10)
      : DEMO_PASSWORD_HASH;

    await queryInterface.bulkInsert('users', [
      {
        id: PRIMARY_ADMIN_ID,
        full_name: 'PARKEA Administrator',
        email,
        password: passwordHash,
        phone: null,
        document_type: 'CC',
        document_number: '0000000001',
        is_active: true,
        is_primary_admin: true,
        role_id: adminRoleId,
        // HU-30: the administrator does not need to verify the email
        email_verified_at: new Date(),
        created_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    const { email } = getAdminConfig(queryInterface);

    await queryInterface.bulkDelete(
      'users',
      { id: PRIMARY_ADMIN_ID, email, is_primary_admin: true },
      {}
    );
  },
};
