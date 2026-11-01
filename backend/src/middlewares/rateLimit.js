const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const ErrorCodes = require('../constants/errorCodes');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Each visitor is counted by their IP address. Some Azure proxies send an
// IPv4 address with the port of the connection ("190.1.2.3:54321"), and the
// port changes on every connection, so it is removed: otherwise every attempt
// would look like a new visitor and the limit would never be reached.
function visitorKey(req) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return ipKeyGenerator(ip.replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1'));
}

// Options shared by every limit. Over the limit the API answers 429 with a
// code, like every other error. The RateLimit headers tell the client how
// many tries are left and when the count starts again.
const common = {
    keyGenerator: visitorKey,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: ErrorCodes.TOO_MANY_REQUESTS, message: 'Too many attempts. Please try again later' },
};

// HU-05 and HU-06: 10 failed sign-ins every 15 minutes. A sign-in that works
// is not counted, so people who type their password well never use tries.
// The user and admin sign-ins share this count.
const loginLimiter = rateLimit({
    ...common,
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    skipSuccessfulRequests: true,
});

// HU-07: every request can send an email, so all of them are counted.
const forgotPasswordLimiter = rateLimit({
    ...common,
    windowMs: FIFTEEN_MINUTES,
    limit: 5,
});

// HU-01 (Audit 1): 10 new accounts every hour. Only accounts that are
// created are counted, so people who share a network (for example the
// SENA Wi-Fi during the demo) are not blocked by someone else's mistakes.
const registerLimiter = rateLimit({
    ...common,
    windowMs: ONE_HOUR,
    limit: 10,
    skipFailedRequests: true,
});

module.exports = { loginLimiter, forgotPasswordLimiter, registerLimiter };
