'use strict';
const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface) {
    const [roles] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'admin' LIMIT 1;"
    );
    const adminRoleId = roles[0].id;

    const passwordHash = await bcrypt.hash('Admin123!', 10);

    await queryInterface.bulkInsert('users', [
      {
        id: 'a0000000-0000-0000-0000-000000000001',
        full_name: 'PARKEA Administrator',
        email: 'admin@parkea.com',
        password: passwordHash,
        phone: null,
        document_type: 'CC',
        document_number: '0000000001',
        is_active: true,
        is_primary_admin: true,
        role_id: adminRoleId,
        created_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'admin@parkea.com' }, {});
  },
};