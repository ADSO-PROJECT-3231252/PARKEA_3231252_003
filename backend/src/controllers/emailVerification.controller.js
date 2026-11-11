const { Op } = require('sequelize');
const { Usuario, EmailVerificationToken, sequelize } = require('../models');
const { enviarCorreoVerificacion } = require('../utils/mailer');
const { hashToken, createSecureToken } = require('../utils/secureToken');
const ErrorCodes = require('../constants/errorCodes');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (AC-01)

// Creates a new verification link for the account. The links it had before
// stop working, so only the newest one can be used (AC-05).
async function crearEnlaceVerificacion(userId, transaction) {
    await EmailVerificationToken.update(
        { usedAt: new Date() },
        { where: { userId, usedAt: null }, transaction }
    );

    const { token, tokenHash } = createSecureToken();
    await EmailVerificationToken.create({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    }, { transaction });

    return token;
}

// The email goes out in the background, like the recovery email: the answer
// does not wait for the email provider, and a failure only goes to the
// server log. The user can always ask for the email again (AC-05).
function enviarEnlaceVerificacion(usuario, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;
    const primerNombre = (usuario.fullName || '').trim().split(/\s+/)[0];

    enviarCorreoVerificacion(usuario.email, verifyUrl, primerNombre).catch((error) => {
        console.error('Could not send the verification email:', error.message);
    });
}

// POST /api/auth/verify-email — HU-30, AC-02 and AC-03
async function verificarCorreo(req, res, next) {
    try {
        const registro = await EmailVerificationToken.findOne({ where: { tokenHash: hashToken(req.body.token) } });

        const vigente = registro && registro.usedAt === null && new Date(registro.expiresAt) > new Date();

        // Same order as the sign-up: first the account (locked), then its
        // links. The link is marked as used only if it is still unused and
        // valid at that moment, so it works only once even if it is opened
        // twice at the same time, and a sign-up never changes the account
        // in the middle.
        const usado = vigente && await sequelize.transaction(async (transaction) => {
            const usuario = await Usuario.findByPk(registro.userId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!usuario) return false;

            const ahora = new Date();
            const [marcados] = await EmailVerificationToken.update(
                { usedAt: ahora },
                { where: { id: registro.id, usedAt: null, expiresAt: { [Op.gt]: ahora } }, transaction }
            );
            if (marcados === 0) return false;

            if (!usuario.emailVerifiedAt) {
                await usuario.update({ emailVerifiedAt: ahora }, { transaction });
            }
            return true;
        });

        if (!usado) {
            return res.status(400).json({
                code: ErrorCodes.VERIFICATION_TOKEN_INVALID,
                message: 'This verification link is no longer valid. Please request a new one.',
            });
        }

        return res.status(200).json({ message: 'Your email has been verified. Please sign in.' });
    } catch (error) {
        next(error);
    }
}

// POST /api/auth/resend-verification — HU-30, AC-05
async function reenviarVerificacion(req, res, next) {
    try {
        // Always the same answer, whether the email exists, is verified or
        // not, so it never reveals whether an email is registered.
        const respuestaGenerica = {
            message: "If that account still needs to be verified, we've sent a new link",
        };

        const usuario = await Usuario.findOne({ where: { email: req.body.email } });
        if (!usuario || usuario.emailVerifiedAt) {
            return res.status(200).json(respuestaGenerica);
        }

        // The account is locked first, like in the sign-up, and read again:
        // it may have been verified a moment ago
        const token = await sequelize.transaction(async (transaction) => {
            const cuenta = await Usuario.findByPk(usuario.id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!cuenta || cuenta.emailVerifiedAt) return null;
            return crearEnlaceVerificacion(cuenta.id, transaction);
        });
        if (token) {
            enviarEnlaceVerificacion(usuario, token);
        }

        return res.status(200).json(respuestaGenerica);
    } catch (error) {
        next(error);
    }
}

module.exports = { crearEnlaceVerificacion, enviarEnlaceVerificacion, verificarCorreo, reenviarVerificacion };
