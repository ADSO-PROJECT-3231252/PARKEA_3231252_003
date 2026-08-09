'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface) {
    const zonas = [
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
    ];

    await queryInterface.bulkInsert('zones', zonas);

    // Generate one physical parking spot per slot for each zone,
    // same as createZona() does for zones created through the API
    const spots = [];
    for (const zona of zonas) {
      for (let i = 1; i <= zona.total_slots; i++) {
        spots.push({
          id: uuidv4(),
          zone_id: zona.id,
          spot_number: i,
          status: 'Available',
        });
      }
    }
    await queryInterface.bulkInsert('parking_spots', spots);
  },

  async down(queryInterface, Sequelize) {
    const { Op } = Sequelize;
    const zoneNames = ['Centro', 'Parque Olaya', 'La Popa', 'Av. Simón Bolívar'];

    const zonas = await queryInterface.sequelize.query(
      `SELECT id FROM zones WHERE name IN (:zoneNames)`,
      { replacements: { zoneNames }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const zoneIds = zonas.map((z) => z.id);

    if (zoneIds.length > 0) {
      await queryInterface.bulkDelete('parking_spots', { zone_id: { [Op.in]: zoneIds } }, {});
    }
    await queryInterface.bulkDelete('zones', { name: { [Op.in]: zoneNames } }, {});
  },
};