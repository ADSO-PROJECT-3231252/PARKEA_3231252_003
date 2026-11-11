const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { Usuario, Rol, PasswordResetToken, sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');
const { createSessionToken } = require('../utils/sessionToken');

// GET /api/users/me — load the authenticated user's profile
async function obtenerPerfil(req, res, next) {
    try {
        const userId = req.usuario.id;

        const usuario = await Usuario.findByPk(userId, {
            include: { model: Rol, as: 'role' },
        });
        if (!usuario) {
            return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }

        return res.status(200).json({
            user: {
                id: usuario.id,
                fullName: usuario.fullName,
                email: usuario.email,
                phone: usuario.phone,
                documentType: usuario.documentType,
                documentNumber: usuario.documentNumber,
                role: usuario.role.name,
                createdAt: usuario.created_at,
            },
        });
    } catch (error) {
        next(error);
    }
}

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

        const actualizado = await sequelize.transaction(async (transaction) => {
            // The account is read again, locked: the password may have
            // changed while the new one was hashed (for example, with a
            // recovery link). In that case the current password that was
            // checked above is no longer the current one.
            const cuenta = await Usuario.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!cuenta || cuenta.password !== usuario.password) return null;

            // #199: the session tokens issued before this change stop
            // working, and so do the recovery links of the account
            await PasswordResetToken.update(
                { usedAt: new Date() },
                { where: { userId, usedAt: null }, transaction }
            );
            return cuenta.update({ password: hashNuevo, passwordVersion: cuenta.passwordVersion + 1 }, { transaction });
        });

        if (!actualizado) {
            return res.status(401).json({ code: ErrorCodes.CURRENT_PASSWORD_INCORRECT, message: 'Current password is incorrect' });
        }

        // The token of this request is one of the old ones now, so the
        // answer brings a new one and this session goes on
        return res.status(200).json({
            message: 'Password updated successfully',
            token: createSessionToken(actualizado, req.usuario.rol),
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { obtenerPerfil, editarPerfil, cambiarPassword };
