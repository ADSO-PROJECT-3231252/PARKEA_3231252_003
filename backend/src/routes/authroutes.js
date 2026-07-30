const express = require('express');
const router = express.Router();

console.log("=== AUTH ROUTES CARGADAS ===");

router.get('/test', (req, res) => {
    res.json({ ok: true });
});

const {
    register,
    login
} = require('../controllers/authController');

const {
    validateRegister,
    validateLogin
} = require('../middlewares/authValidator');

router.post('/register', validateRegister, register);

router.post('/login', validateLogin, login);

module.exports = router;