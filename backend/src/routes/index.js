const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/vehicles', require('./vehiculo.routes'));
router.use('/zones', require('./zona.routes'));
router.use('/reservations', require('./reserva.routes'));

module.exports = router;