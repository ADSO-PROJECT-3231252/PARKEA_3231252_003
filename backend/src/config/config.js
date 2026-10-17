require('dotenv').config();

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'mysql',
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'mysql',
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'mysql',
    // Azure Database for MySQL only accepts encrypted (TLS) connections.
    dialectOptions: {
      ssl: { rejectUnauthorized: true },
    },
  },
};
