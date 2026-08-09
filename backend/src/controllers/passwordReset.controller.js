const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Usuario, PasswordResetToken } = require('../models');
const { enviarCorreoRecuperacion } = require('../utils/mailer');
const ErrorCodes = require('../constants/errorCodes');

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const SALT_ROUNDS = 10;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// PHASE 1 — POST /api/auth/forgot-password
// HU-07, AC-01 a AC-06
async function solicitarRecuperacion(req, res, next) {
    try {
        const { email } = req.body;

        // Always respond the same way, whether the email exists or not,
        // to prevent user enumeration (same principle as login)
        const respuestaGenerica = {
            message: "If an account exists for that email, we've sent a recovery link",
        };

        const usuario = await Usuario.findOne({ where: { email } });
        if (!usuario) {
            return res.status(200).json(respuestaGenerica);
        }

        // Generate a random token; only its hash is stored, the raw token
        // goes in the email link and is never persisted anywhere
        const tokenPlano = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(tokenPlano);
        const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

        await PasswordResetToken.create({
            userId: usuario.id,
            tokenHash,
            expiresAt,
        });

        const resetUrl = `http://localhost:5173/restablecer?token=${tokenPlano}`;
        await enviarCorreoRecuperacion(usuario.email, resetUrl);

        return res.status(200).json(respuestaGenerica);
    } catch (error) {
        next(error);
    }
}

// PHASE 2 — POST /api/auth/reset-password
// HU-07, AC-07 a AC-10
async function restablecerPassword(req, res, next) {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ code: ErrorCodes.MISSING_REQUIRED_FIELDS, message: 'token and newPassword are required' });
        }

        const tokenHash = hashToken(token);

        const registro = await PasswordResetToken.findOne({ where: { tokenHash } });

        const esInvalido =
            !registro ||
            registro.usedAt !== null ||
            new Date(registro.expiresAt) < new Date();

        if (esInvalido) {
            return res.status(400).json({
                code: 'RESET_TOKEN_INVALID',
                message: 'This recovery link is no longer valid. Please request a new one.',
            });
        }

        const usuario = await Usuario.findByPk(registro.userId);
        if (!usuario) {
            return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await usuario.update({ password: passwordHash });

        // Single-use: mark this token as used so it can never be replayed
        await registro.update({ usedAt: new Date() });

        return res.status(200).json({
            message: 'Your password has been updated. Please sign in.',
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { solicitarRecuperacion, restablecerPassword };