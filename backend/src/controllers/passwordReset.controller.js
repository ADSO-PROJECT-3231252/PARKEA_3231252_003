const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { Usuario, PasswordResetToken, EmailVerificationToken, sequelize } = require('../models');
const { enviarCorreoRecuperacion } = require('../utils/mailer');
const ErrorCodes = require('../constants/errorCodes');
const { hashToken, createSecureToken } = require('../utils/secureToken');

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const SALT_ROUNDS = 10;

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

        // #199: the answer goes out here, before the link is created, so it
        // takes the same time whether the account exists or not. Everything
        // below runs after the answer; if it fails it only goes to the
        // server log (a 500 would tell anyone that the account exists).
        res.status(200).json(respuestaGenerica);
        if (!usuario) return;

        crearYEnviarEnlace(usuario).catch((error) => {
            console.error('Could not send the recovery email:', error.message);
        });
    } catch (error) {
        next(error);
    }
}

// Creates the recovery link of the account and sends it by email. The links
// it had before stop working, so only the newest one can be used (#199).
async function crearYEnviarEnlace(usuario) {
    // Only the hash of the token is stored; the token itself goes in the
    // link of the email and is never saved anywhere
    const { token: tokenPlano, tokenHash } = createSecureToken();

    await sequelize.transaction(async (transaction) => {
        // Same order as everywhere else: first the account (locked), then
        // its links
        await Usuario.findByPk(usuario.id, { transaction, lock: transaction.LOCK.UPDATE });
        await PasswordResetToken.update(
            { usedAt: new Date() },
            { where: { userId: usuario.id, usedAt: null }, transaction }
        );
        await PasswordResetToken.create({
            userId: usuario.id,
            tokenHash,
            expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        }, { transaction });
    });

    // Link to the web app that sent the request: the hosted site in
    // production, the local Vite server in development.
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${tokenPlano}`;

    // The email greets the user by the first name ("Hola, Laura:")
    const primerNombre = (usuario.fullName || '').trim().split(/\s+/)[0];
    await enviarCorreoRecuperacion(usuario.email, resetUrl, primerNombre);
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
                code: ErrorCodes.RESET_TOKEN_INVALID,
                message: 'This recovery link is no longer valid. Please request a new one.',
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        const resultado = await sequelize.transaction(async (transaction) => {
            // Same order as the sign-up: first the account (locked), then
            // the links
            const usuario = await Usuario.findByPk(registro.userId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!usuario) return 'USER_NOT_FOUND';

            // Single-use: the link is marked as used only if it is still
            // unused and valid, so it can never be used twice
            const ahora = new Date();
            const [marcados] = await PasswordResetToken.update(
                { usedAt: ahora },
                { where: { id: registro.id, usedAt: null, expiresAt: { [Op.gt]: ahora } }, transaction }
            );
            if (marcados === 0) return 'RESET_TOKEN_INVALID';

            // #199: the session tokens issued before this change stop
            // working, and so do the other recovery links of the account
            const cambios = { password: passwordHash, passwordVersion: usuario.passwordVersion + 1 };
            await PasswordResetToken.update(
                { usedAt: ahora },
                { where: { userId: usuario.id, usedAt: null }, transaction }
            );

            // HU-30: the recovery link proves that the email belongs to the
            // user, so it also verifies an account that was not verified
            // yet, and its verification links stop working
            if (!usuario.emailVerifiedAt) {
                cambios.emailVerifiedAt = ahora;
                await EmailVerificationToken.update(
                    { usedAt: ahora },
                    { where: { userId: usuario.id, usedAt: null }, transaction }
                );
            }
            await usuario.update(cambios, { transaction });
            return 'OK';
        });

        if (resultado === 'USER_NOT_FOUND') {
            return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }
        if (resultado === 'RESET_TOKEN_INVALID') {
            return res.status(400).json({
                code: ErrorCodes.RESET_TOKEN_INVALID,
                message: 'This recovery link is no longer valid. Please request a new one.',
            });
        }

        return res.status(200).json({
            message: 'Your password has been updated. Please sign in.',
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { solicitarRecuperacion, restablecerPassword };
