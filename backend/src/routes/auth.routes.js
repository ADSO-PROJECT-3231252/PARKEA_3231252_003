const router = require('express').Router();
const { register, login } = require('../controllers/auth.controller');
const { validateRegister, validateLogin } = require('../middlewares/auth.validator');

router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.use('/', require('./passwordReset.routes'));

module.exports = router;