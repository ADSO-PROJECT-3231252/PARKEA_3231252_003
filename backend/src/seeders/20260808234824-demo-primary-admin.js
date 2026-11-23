'use strict';

const bcrypt = require('bcrypt');

const PRIMARY_ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const DEMO_EMAIL = 'admin@parkea.com';

// Hash of the existing local demo password. Used only in explicit demo mode.
const DEMO_PASSWORD_HASH =
  '$2b$10$5gotC6tBCUjfY/bWneUwCuSJrTUb4uh8/jOYOau6doqExaHOSiDMG';

function getAdminConfig() {
  const email = process.env.PRIMARY_ADMIN_EMAIL?.trim();
  const password = process.env.PRIMARY_ADMIN_PASSWORD;

  if (email && password) {
    return { email, password };
  }

  if (email || password) {
    throw new Error(
      'Set both PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD.'
    );
  }

  if (process.env.SEED_DEMO_ADMIN === 'true') {
    return { email: DEMO_EMAIL };
  }

  throw new Error(
    'Set PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD, or set SEED_DEMO_ADMIN=true for a local demo.'
  );
}

module.exports = {
  async up(queryInterface) {
    const { email, password } = getAdminConfig();

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
    const { email } = getAdminConfig();

    await queryInterface.bulkDelete(
      'users',
      { id: PRIMARY_ADMIN_ID, email, is_primary_admin: true },
      {}
    );
  },
};
