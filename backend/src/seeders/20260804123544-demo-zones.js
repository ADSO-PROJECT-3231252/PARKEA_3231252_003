'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface) {
    // HU-31 (AC-16): the vehicle types each demo zone accepts, with their
    // spots and rates, so the screens can be tried with several types
    const zonas = [
      {
        id: uuidv4(),
        name: 'Centro',
        address: 'Cra. 16 con Calle 32, Dosquebradas',
        latitude: 4.8375,
        longitude: -75.6689,
        is_active: true,
        tipos: [['car', 30, 2000], ['motorcycle', 12, 1000]],
      },
      {
        id: uuidv4(),
        name: 'Parque Olaya',
        address: 'Calle 41 con Av. Ferrocarril, Dosquebradas',
        latitude: 4.8398,
        longitude: -75.6721,
        is_active: true,
        tipos: [['car', 18, 2500]],
      },
      {
        id: uuidv4(),
        name: 'La Popa',
        address: 'Calle 28 con Cra. 10, Dosquebradas',
        latitude: 4.8291,
        longitude: -75.6645,
        is_active: true,
        tipos: [['car', 24, 1800], ['motorcycle', 8, 900], ['truck', 4, 5000]],
      },
      {
        id: uuidv4(),
        name: 'Av. Simón Bolívar',
        address: 'Km 2 vía Pereira, Dosquebradas',
        latitude: 4.8156,
        longitude: -75.6934,
        is_active: true,
        tipos: [['car', 45, 1500], ['truck', 6, 4500]],
      },
    ];

    // Until the last migration of HU-31, a zone also keeps the spots of all
    // its types and the rate of its first type, as createZona() does
    await queryInterface.bulkInsert('zones', zonas.map(({ tipos, ...zona }) => ({
      ...zona,
      total_slots: tipos.reduce((sum, [, totalSlots]) => sum + totalSlots, 0),
      hourly_rate: tipos[0][2],
    })));

    await queryInterface.bulkInsert('zone_vehicle_types', zonas.flatMap((zona) => zona.tipos.map(([vehicleType, totalSlots, hourlyRate]) => ({
      id: uuidv4(),
      zone_id: zona.id,
      vehicle_type: vehicleType,
      total_slots: totalSlots,
      hourly_rate: hourlyRate,
      is_accepting: true,
    }))));

    // One physical spot per slot of each type, numbered from 1 in each type,
    // same as createZona() does for zones created through the API
    const spots = [];
    for (const zona of zonas) {
      for (const [vehicleType, totalSlots] of zona.tipos) {
        for (let i = 1; i <= totalSlots; i++) {
          spots.push({
            id: uuidv4(),
            zone_id: zona.id,
            vehicle_type: vehicleType,
            spot_number: i,
            status: 'Available',
          });
        }
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
      // HU-31: after the spots, which must belong to a type of their zone
      await queryInterface.bulkDelete('zone_vehicle_types', { zone_id: { [Op.in]: zoneIds } }, {});
    }
    await queryInterface.bulkDelete('zones', { name: { [Op.in]: zoneNames } }, {});
  },
};
