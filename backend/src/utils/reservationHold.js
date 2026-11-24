// The 15 minutes a Pending reservation has to be paid (HU-26), shared by the
// payment (HU-17) and the cancellation (HU-16).
const ErrorCodes = require('../constants/errorCodes');

// The expiration job only runs every 60 s, so a reservation can still say
// Pending for up to a minute after its 15 minutes end. From that moment it
// counts as expired for everything (#347): the deadline decides, not the
// job. A Pending reservation without a deadline never expires here.
function countsAsExpired(reserva, now = new Date()) {
    if (reserva.status === 'Expired') return true;
    return reserva.status === 'Pending'
        && Boolean(reserva.holdExpiresAt)
        && new Date(reserva.holdExpiresAt) <= now;
}

// The answer to paying or cancelling a reservation that expired
const RESERVATION_EXPIRED = {
    code: ErrorCodes.RESERVATION_EXPIRED,
    message: 'This reservation expired because it was not paid in time. Please make a new reservation.',
};

module.exports = { countsAsExpired, RESERVATION_EXPIRED };
