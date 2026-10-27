const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

const SALT_ROUNDS = 10;

// HU-01: User Registration
async function register(req, res) {
    try {
        const { fullName, email, password, phone, documentType, documentNumber } = req.body;

        const existingEmail = await Usuario.findOne({ where: { email } });
        if (existingEmail) {
            return res.status(409).json({ code: ErrorCodes.EMAIL_ALREADY_REGISTERED, message: 'This email is already registered' });
        }

        const existingDocument = await Usuario.findOne({ where: { documentNumber } });
        if (existingDocument) {
            return res.status(409).json({ code: ErrorCodes.DOCUMENT_ALREADY_REGISTERED, message: 'This document number is already registered' });
        }

        const defaultRole = await Rol.findOne({ where: { name: 'user' } });
        if (!defaultRole) {
            return res.status(500).json({ code: ErrorCodes.ROLE_NOT_CONFIGURED, message: 'Default role not configured. Run the roles seed.' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const usuario = await Usuario.create({
            fullName,
            email,
            password: passwordHash,
            phone,
            documentType,
            documentNumber,
            roleId: defaultRole.id,
        });

        return res.status(201).json({
            message: 'Registration complete. Please sign in.',
            user: { id: usuario.id, fullName: usuario.fullName, email: usuario.email },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Error registering user' });
    }
}

// HU-05: User Login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({ where: { email }, include: { model: Rol, as: 'role' } });
        if (!usuario) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        if (!usuario.isActive) {
            return res.status(403).json({ code: ErrorCodes.ACCOUNT_DEACTIVATED, message: 'This account has been deactivated' });
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
        return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Error logging in' });
    }
}

// HU-06: Administrator Login
async function loginAdmin(req, res) {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({ where: { email }, include: { model: Rol, as: 'role' } });
        if (!usuario) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        if (!usuario.isActive) {
            return res.status(403).json({ code: ErrorCodes.ACCOUNT_DEACTIVATED, message: 'This account has been deactivated' });
        }

        // Credentials are valid at this point — unlike wrong credentials, revealing
        // that the account lacks admin privileges is intentional and required (AC-06)
        if (usuario.role.name !== 'admin') {
            return res.status(403).json({ code: ErrorCodes.NOT_ADMIN_ACCOUNT, message: 'This account does not have administrator privileges' });
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
        return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Error logging in' });
    }
}

module.exports = { register, login, loginAdmin };