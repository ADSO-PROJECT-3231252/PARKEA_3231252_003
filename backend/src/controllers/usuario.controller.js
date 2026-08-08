const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { Usuario } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

// HU-08: Edit profile (name/phone)
async function editarPerfil(req, res, next) {
    try {
        const errores = validationResult(req);
        if (!errores.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errores.array() });
        }

        const userId = req.usuario.id;
        const { fullName, phone } = req.body;

        const usuario = await Usuario.findByPk(userId);
        if (!usuario) {
            return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }

        await usuario.update({ fullName, phone });

        return res.status(200).json({
            message: 'Profile updated successfully',
            user: {
                id: usuario.id,
                fullName: usuario.fullName,
                email: usuario.email,
                phone: usuario.phone,
            },
        });
    } catch (error) {
        next(error);
    }
}

// HU-08: Change password
async function cambiarPassword(req, res, next) {
    try {
        const errores = validationResult(req);
        if (!errores.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errores.array() });
        }

        const userId = req.usuario.id;
        const { currentPassword, newPassword } = req.body;

        const usuario = await Usuario.findByPk(userId);
        if (!usuario) {
            return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }

        const passwordValida = await bcrypt.compare(currentPassword, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ code: ErrorCodes.CURRENT_PASSWORD_INCORRECT, message: 'Current password is incorrect' });
        }

        const esLaMisma = await bcrypt.compare(newPassword, usuario.password);
        if (esLaMisma) {
            return res.status(400).json({ code: ErrorCodes.PASSWORD_UNCHANGED, message: 'New password must be different from the current one' });
        }

        const hashNuevo = await bcrypt.hash(newPassword, 10);
        await usuario.update({ password: hashNuevo });

        return res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
}

module.exports = { editarPerfil, cambiarPassword };