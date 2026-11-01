const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const ErrorCodes = require('../constants/errorCodes');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// The visitor's IP address. Some Azure proxies add the port of the
// connection ("190.1.2.3:54321" or "[2800:e2::1]:4000"), and the port
// changes on every connection, so it is removed: otherwise every attempt
// would look like a new visitor and the limit would never be reached.
function clientIp(req) {
    const ip = req.ip || req.socket.remoteAddress || '';
    const ipv6 = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (ipv6) return ipv6[1];
    return ip.replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1');
}

// Counts by network: everyone behind the same IP shares it.
function networkKey(req) {
    return ipKeyGenerator(clientIp(req));
}

// Counts by network and email, so on a shared network (for example the SENA
// Wi-Fi during the demo) each person has their own tries.
function accountKey(req) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${networkKey(req)}|${email}`;
}

// Options shared by every limit. Over the limit the API answers 429 with a
// code, like every other error. The RateLimit headers tell the client how
// many tries are left and when the count starts again.
const common = {
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: ErrorCodes.TOO_MANY_REQUESTS, message: 'Too many attempts. Please try again later' },
};

// In each list the limit per email goes first: a request it rejects never
// reaches the limit per network, so a person who keeps trying after being
// blocked does not use up the tries of everyone else on the same network.

// HU-05 and HU-06: only failed sign-ins are counted. A sign-in that works is
// not counted, and neither is a server error (for example, the database is
// down), because it is not the person's mistake. The user and admin sign-ins
// share the counts.
// - 10 failed sign-ins every 15 minutes for each email on a network.
// - 100 failed sign-ins every 15 minutes for the whole network, so one
//   computer cannot try many different emails.
const loginOptions = {
    ...common,
    windowMs: FIFTEEN_MINUTES,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode < 400 || res.statusCode >= 500,
};
const loginLimiter = [
    rateLimit({ ...loginOptions, keyGenerator: accountKey, limit: 10 }),
    rateLimit({ ...loginOptions, keyGenerator: networkKey, limit: 100 }),
];

// HU-07: every request can send an email, so all of them are counted.
// - 5 requests every 15 minutes for each email on a network.
// - 20 requests every hour for the whole network, to protect the daily
//   email quota.
const forgotPasswordLimiter = [
    rateLimit({ ...common, keyGenerator: accountKey, windowMs: FIFTEEN_MINUTES, limit: 5 }),
    rateLimit({ ...common, keyGenerator: networkKey, windowMs: ONE_HOUR, limit: 20 }),
];

// HU-01 (Audit 1): 30 new accounts every hour for each network. Only accounts
// that are created are counted, so mistakes in the form never use tries, and
// a class or the demo can sign up from the same Wi-Fi.
const registerLimiter = rateLimit({
    ...common,
    keyGenerator: networkKey,
    windowMs: ONE_HOUR,
    limit: 30,
    skipFailedRequests: true,
});

module.exports = { loginLimiter, forgotPasswordLimiter, registerLimiter };
