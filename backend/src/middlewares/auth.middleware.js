const jwt = require('jsonwebtoken');

// Verifies the JWT sent in the Authorization header (Bearer token)
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        // payload: { id, email, rol }
        req.usuario = payload;
        next();
    });
}

// Restricts a route to one or more roles (e.g. 'admin')
function verificarRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ message: 'You do not have permission for this action' });
        }
        next();
    };
}

module.exports = { verificarToken, verificarRol };