// Rules of the simulated payment (HU-17), shared by every screen that charges:
// the reservation payment, the balance of an open stay (HU-27) and the
// extension of a stay (HU-28).
const ErrorCodes = require('../constants/errorCodes');

const DECLINED_TEST_CARD = '0002'; // simulated decline test card

// Checks the payment method and, for a card, its last 4 digits. Returns the
// error to answer, or null when they are valid.
function validarMetodoPago({ paymentMethod, cardLastFour }) {
    if (!paymentMethod || !['card', 'pse'].includes(paymentMethod)) {
        return { status: 400, body: { code: ErrorCodes.INVALID_PAYMENT_METHOD, message: 'Invalid payment method' } };
    }
    if (paymentMethod === 'card') {
        // Only text: a list or a number would pass the regular expression below
        if (typeof cardLastFour !== 'string' || !/^\d{4}$/.test(cardLastFour)) {
            return { status: 400, body: { code: ErrorCodes.CARD_DIGITS_REQUIRED, message: 'The last 4 digits of the card are required' } };
        }
    }
    return null;
}

// Simulated decline: a reserved test card number always fails (HU-17, AC-11)
const esRechazado = ({ paymentMethod, cardLastFour }) => paymentMethod === 'card' && cardLastFour === DECLINED_TEST_CARD;

const RECHAZADO = {
    code: ErrorCodes.PAYMENT_DECLINED,
    message: 'Payment declined. Please try another payment method.',
};

module.exports = { validarMetodoPago, esRechazado, RECHAZADO };
