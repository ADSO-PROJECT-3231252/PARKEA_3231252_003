const jwt = require('jsonwebtoken');

// The session token (JWT) of an account. "pv" is the password version of the
// account when the token was issued: auth.middleware.js rejects the token
// once the password changes (#199).
function createSessionToken(usuario, rol) {
    return jwt.sign(
        { id: usuario.id, email: usuario.email, rol, pv: usuario.passwordVersion },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );
}

module.exports = { createSessionToken };
