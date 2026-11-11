const crypto = require('crypto');

// Tokens of the email links (password recovery and email verification).
// The token goes only in the link; the database keeps only its SHA-256
// hash, so a copy of the database is not enough to use a link.
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function createSecureToken() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, tokenHash: hashToken(token) };
}

module.exports = { hashToken, createSecureToken };
