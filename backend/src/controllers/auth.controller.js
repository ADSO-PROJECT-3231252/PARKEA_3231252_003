
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');

const SALT_ROUNDS = 10;

// HU-01: User Registration
async function register(req, res) {
    try {
        const { fullName, email, password, phone } = req.body;

        const existingUser = await Usuario.findOne({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: 'This email is already registered' });
        }

        const defaultRole = await Rol.findOne({ where: { name: 'user' } });
        if (!defaultRole) {
            return res.status(500).json({ message: 'Default role not configured. Run the roles seed.' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const usuario = await Usuario.create({
            fullName,
            email,
            password: passwordHash,
            phone,
            roleId: defaultRole.id,
        });

        return res.status(201).json({
            message: 'User registered successfully',
            user: { id: usuario.id, fullName: usuario.fullName, email: usuario.email, phone: usuario.phone },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error registering user' });
    }
}

// HU-02/05: User Login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({ where: { email }, include: { model: Rol, as: 'role' } });
        if (!usuario) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.role.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        return res.status(200).json({
            message: 'Login successful',
            token,
            user: { id: usuario.id, fullName: usuario.fullName, email: usuario.email, role: usuario.role.name },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error logging in' });
    }
}

module.exports = { register, login };