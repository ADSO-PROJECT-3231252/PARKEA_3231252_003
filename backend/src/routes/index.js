const router = require('express').Router();

router.use('/vehicles', require('./vehiculo.routes'));

module.exports = router;