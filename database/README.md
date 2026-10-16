# Database

This folder holds `schema.sql`, a readable reference of the PARKEA (SIGMUI) database design: tables, primary keys, foreign keys and constraints.

The real database is created with the Sequelize migrations and seeders in `backend/src/migrations` and `backend/src/seeders` (see **Installation and Setup** in the main README). `schema.sql` mirrors those 19 migrations: when the design changes, add a new migration first and then update this file.

Do not run `schema.sql` on the database you use with the migrations: the tables would already exist and sequelize-cli would not know which migrations have run.