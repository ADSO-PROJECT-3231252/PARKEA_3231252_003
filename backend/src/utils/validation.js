// Lets a missing value through, so the next rule still reports it as
// required, but rejects lists, objects and numbers sent where the API expects
// text. Without it, express-validator checks each item of a list and the
// request reaches the controller, which then fails with a 500 (#184).
const isTextOrMissing = (value) => value === undefined || value === null || typeof value === 'string';

module.exports = { isTextOrMissing };
