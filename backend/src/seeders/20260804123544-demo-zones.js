'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('zones', [
      {
        id: uuidv4(),
        name: 'Centro',
        address: 'Cra. 16 con Calle 32, Dosquebradas',
        latitude: 4.8375,
        longitude: -75.6689,
        total_slots: 30,
        available_slots: 30,
        hourly_rate: 2000,
        is_active: true,
      },
      {
        id: uuidv4(),
        name: 'Parque Olaya',
        address: 'Calle 41 con Av. Ferrocarril, Dosquebradas',
        latitude: 4.8398,
        longitude: -75.6721,
        total_slots: 18,
        available_slots: 18,
        hourly_rate: 2500,
        is_active: true,
      },
      {
        id: uuidv4(),
        name: 'La Popa',
        address: 'Calle 28 con Cra. 10, Dosquebradas',
        latitude: 4.8291,
        longitude: -75.6645,
        total_slots: 24,
        available_slots: 24,
        hourly_rate: 1800,
        is_active: true,
      },
      {
        id: uuidv4(),
        name: 'Av. Simón Bolívar',
        address: 'Km 2 vía Pereira, Dosquebradas',
        latitude: 4.8156,
        longitude: -75.6934,
        total_slots: 45,
        available_slots: 45,
        hourly_rate: 1500,
        is_active: true,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('zones', {
      name: ['Centro', 'Parque Olaya', 'La Popa', 'Av. Simón Bolívar'],
    }, {});
  },
};