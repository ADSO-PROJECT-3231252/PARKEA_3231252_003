const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
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

        try {
            // The token itself can still be valid even if the account was
            // deactivated or its role changed after it was issued, so the
            // current state is read on every request (HU-23, AC-05 and AC-11)
            const usuario = await Usuario.findByPk(payload.id, {
                attributes: ['isActive'],
                include: { model: Rol, as: 'role', attributes: ['name'] },
            });
            if (!usuario || !usuario.isActive) {
                return res.status(403).json({ code: ErrorCodes.ACCOUNT_DEACTIVATED, message: 'This account has been deactivated' });
            }

            // verificarRol reads req.usuario.rol: use the role stored now, not the one in the token
            req.usuario = { ...payload, rol: usuario.role.name };
            next();
        } catch (error) {
            console.error('Error checking the session:', error);
            return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Internal server error' });
        }
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