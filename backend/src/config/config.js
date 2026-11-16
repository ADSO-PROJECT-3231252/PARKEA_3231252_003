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
    // #301: the SQL queries are not written to the server log. There was one
    // line for every query, and some carry data of the users (the email of
    // every sign-in, for example).
    logging: false,
  },
};
