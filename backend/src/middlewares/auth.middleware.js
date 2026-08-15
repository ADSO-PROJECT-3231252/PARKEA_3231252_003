const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ code: ErrorCodes.NO_TOKEN, message: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, payload) => {
        if (err) {
            return res.status(403).json({ code: ErrorCodes.INVALID_TOKEN, message: 'Invalid or expired token' });
        }

        // The token itself can still be valid even if the account was
        // deactivated after it was issued, check the current state on
        // every request (HU-23, AC-11: session must end on the next
        // interaction, not just when the token eventually expires)
        const usuario = await Usuario.findByPk(payload.id, { attributes: ['isActive'] });
        if (!usuario || !usuario.isActive) {
            return res.status(403).json({ code: ErrorCodes.ACCOUNT_DEACTIVATED, message: 'This account has been deactivated' });
        }

        req.usuario = payload;
        next();
    });
}

function verificarRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ code: ErrorCodes.FORBIDDEN_ROLE, message: 'You do not have permission for this action' });
        }
        next();
    };
}

module.exports = { verificarToken, verificarRol };