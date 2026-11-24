'use strict';

const INDEX_NAME = 'zones_name_unique';

module.exports = {
  async up(queryInterface, Sequelize) {
    const duplicates = await queryInterface.sequelize.query(
      `SELECT name
       FROM zones
       GROUP BY name
       HAVING COUNT(*) > 1
       LIMIT 1`,
      { type: Sequelize.QueryTypes.SELECT },
    );

    if (duplicates.length > 0) {
      throw new Error(
        `Cannot create ${INDEX_NAME}: multiple zones have the name "${duplicates[0].name}". Resolve duplicate names before retrying.`,
      );
    }

    await queryInterface.addIndex('zones', ['name'], {
      name: INDEX_NAME,
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('zones', INDEX_NAME);
  },
};
