const jwt = require('jsonwebtoken');
const ErrorCodes = require('../constants/errorCodes');

// Verifies the JWT sent in the Authorization header (Bearer token)
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ code: ErrorCodes.NO_TOKEN, message: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(403).json({ code: ErrorCodes.INVALID_TOKEN, message: 'Invalid or expired token' });
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