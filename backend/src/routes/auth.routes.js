const router = require('express').Router();
const { register, login, loginAdmin } = require('../controllers/auth.controller');
const { validateRegister, validateLogin } = require('../middlewares/auth.validator');
const { loginLimiter, registerLimiter } = require('../middlewares/rateLimit');

router.post('/register',registerLimiter, validateRegister, register);
router.post('/login',loginLimiter, validateLogin, login);
router.post('/login-admin',loginLimiter, validateLogin, loginAdmin);
router.use('/', require('./passwordReset.routes'));

module.exports = router;
