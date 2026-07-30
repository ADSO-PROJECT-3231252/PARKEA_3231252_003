const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/vehicles', require('./vehiculo.routes'));

module.exports = router;