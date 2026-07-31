const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/vehicles', require('./vehiculo.routes'));
router.use('/zones', require('./zona.routes'));

module.exports = router;