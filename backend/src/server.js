require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const { iniciarJobExpiracion } = require('./jobs/expirar-reservas.job');
const { iniciarJobFinalizacion } = require('./jobs/finalizar-reservas.job');

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        await sequelize.authenticate();
        console.log('MySQL connection established successfully.');

        app.listen(PORT, () => {
            console.log(`PARKEA server running on http://localhost:${PORT}`);
            iniciarJobExpiracion();
            iniciarJobFinalizacion();
        });
    } catch (error) {
        console.error('Unable to start the server:', error);
        process.exit(1);
    }
}

start();