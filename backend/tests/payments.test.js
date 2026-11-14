const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Reserva, Pago, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-17: paying a reservation, and HU-27: paying the balance of an open stay.
// The times are in Colombia (UTC-5), "now" is Monday 2026-11-16 at 8:00 a. m.
// and the rate is $ 2.000 per hour.
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`);
const NOW = colombia('08:00');
const MINUTE = 60 * 1000;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '66666666-6666-4666-8666-666666666666';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

let transaction;
let startTransaction;
let findReservation;
let findPayment;
let createPayment;

// A reservation waiting for its payment, from 10:00 a. m. to 11:30 a. m.,
// with 10 minutes left to pay, unless the test changes it
function reservation(values = {}) {
    return {
        id: RESERVATION_ID,
        userId: USER_ID,
        status: 'Pending',
        openEnded: false,
        startTime: colombia('10:00'),
        endTime: colombia('11:30'),
        holdExpiresAt: new Date(NOW.getTime() + 10 * MINUTE),
        appliedHourlyRate: '2000.00',
        save: jest.fn(),
        ...values,
    };
}

function arrange(reserva = reservation(), payment = null) {
    findReservation = jest.spyOn(Reserva, 'findByPk').mockResolvedValue(reserva);
    findPayment = jest.spyOn(Pago, 'findOne').mockResolvedValue(payment);
    createPayment = jest.spyOn(Pago, 'create').mockImplementation(async (values) => ({ id: 'payment-1', ...values }));
    return reserva;
}

const send = (path, body) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
const pay = (body) => send(`/api/payments/${RESERVATION_ID}`, body);
const payBalance = (body) => send(`/api/payments/${RESERVATION_ID}/balance`, body);

const CARD = { paymentMethod: 'card', cardLastFour: '4242' };
const PSE = { paymentMethod: 'pse' };
const DECLINED_CARD = { paymentMethod: 'card', cardLastFour: '0002' };

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    startTransaction = jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    // The session of the user (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, role: { name: 'user' } });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('The payment method (HU-17)', () => {
    test.each([
        ['without a method', {}],
        ['with cash', { paymentMethod: 'cash' }],
    ])('a payment %s answers 400 INVALID_PAYMENT_METHOD before reading the reservation', async (name, body) => {
        // Arrange
        arrange();

        // Act
        const res = await pay(body);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PAYMENT_METHOD');
        expect(startTransaction).not.toHaveBeenCalled();
        expect(createPayment).not.toHaveBeenCalled();
    });

    test.each([
        ['without digits', undefined],
        ['with 3 digits', '424'],
        ['with letters', '42a2'],
        ['sent as a number', 4242],
    ])('a card %s answers 400 CARD_DIGITS_REQUIRED', async (name, cardLastFour) => {
        // Arrange
        arrange();

        // Act
        const res = await pay({ paymentMethod: 'card', cardLastFour });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CARD_DIGITS_REQUIRED');
        expect(createPayment).not.toHaveBeenCalled();
    });
});

describe('When a reservation can be paid (HU-17, HU-26)', () => {
    test('a reservation that does not exist answers 404 RESERVATION_NOT_FOUND', async () => {
        // Arrange
        arrange(null);

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test('a reservation of another user answers 403 RESERVATION_NOT_OWNED', async () => {
        // Arrange
        const reserva = arrange(reservation({ userId: OTHER_USER_ID }));

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('RESERVATION_NOT_OWNED');
        expect(createPayment).not.toHaveBeenCalled();
        expect(reserva.save).not.toHaveBeenCalled();
    });

    test('the reservation is read with a lock, so two payments at once cannot both be approved', async () => {
        // Arrange
        arrange();

        // Act
        await pay(CARD);

        // Assert
        expect(findReservation).toHaveBeenCalledWith(RESERVATION_ID, { transaction, lock: 'UPDATE' });
    });

    test('a reservation with status Expired answers 400 RESERVATION_EXPIRED', async () => {
        // Arrange
        const reserva = arrange(reservation({ status: 'Expired' }));

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESERVATION_EXPIRED');
        expect(reserva.save).not.toHaveBeenCalled();
    });

    test('a reservation still Pending whose time to pay ended answers 400 RESERVATION_EXPIRED (HU-26, AC-06)', async () => {
        // Arrange: the job that expires reservations has not run yet
        const reserva = arrange(reservation({ holdExpiresAt: NOW }));

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESERVATION_EXPIRED');
        expect(createPayment).not.toHaveBeenCalled();
        expect(reserva.save).not.toHaveBeenCalled();
    });

    test.each(['Active', 'Cancelled', 'Finished'])('a reservation with status %s answers 400 RESERVATION_NOT_PENDING', async (status) => {
        // Arrange
        arrange(reservation({ status, holdExpiresAt: null }));

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESERVATION_NOT_PENDING');
        expect(createPayment).not.toHaveBeenCalled();
    });

    test('a reservation that already has its initial payment answers 400 PAYMENT_ALREADY_EXISTS', async () => {
        // Arrange
        arrange(reservation(), { id: 'payment-0', type: 'initial' });

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PAYMENT_ALREADY_EXISTS');
        expect(findPayment).toHaveBeenCalledWith({ where: { reservationId: RESERVATION_ID, type: 'initial' }, transaction });
        expect(createPayment).not.toHaveBeenCalled();
    });

    test('a declined card answers 402 PAYMENT_DECLINED and the reservation keeps waiting for its payment', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await pay(DECLINED_CARD);

        // Assert
        expect(res.status).toBe(402);
        expect(res.body.code).toBe('PAYMENT_DECLINED');
        expect(createPayment).not.toHaveBeenCalled();
        expect(reserva.save).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });
});

describe('Paying a reservation (HU-17)', () => {
    test('the amount is the hours of the reservation at its rate, and the card keeps only its last 4 digits', async () => {
        // Arrange: 1 hour and 30 minutes at $ 2.000
        arrange();

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(201);
        expect(createPayment).toHaveBeenCalledWith({
            reservationId: RESERVATION_ID,
            amount: 3000,
            paymentStatus: 'Paid',
            paymentMethod: 'card',
            cardLastFour: '4242',
            paidAt: NOW,
            type: 'initial',
        }, { transaction });
        expect(res.body.payment).toMatchObject({ amount: 3000, paymentStatus: 'Paid' });
    });

    test('the reservation becomes Active and has no time limit to pay anymore', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        await pay(PSE);

        // Assert
        expect(reserva.status).toBe('Active');
        expect(reserva.holdExpiresAt).toBeNull();
        expect(reserva.save).toHaveBeenCalledWith({ transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('PSE keeps no card digits, even if they are sent', async () => {
        // Arrange
        arrange();

        // Act
        await pay({ paymentMethod: 'pse', cardLastFour: '4242' });

        // Assert
        expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'pse', cardLastFour: null }), { transaction });
    });

    test('an open stay pays only its first hour (HU-27, AC-03)', async () => {
        // Arrange: its saved exit time is the provisional one, 24 hours later
        arrange(reservation({ openEnded: true, endTime: new Date('2026-11-17T10:00:00-05:00') }));

        // Act
        await pay(CARD);

        // Assert
        expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 2000 }), { transaction });
    });

    test('a rate with cents keeps its cents', async () => {
        // Arrange: 1 hour and 30 minutes at $ 1.234,50
        arrange(reservation({ appliedHourlyRate: '1234.50' }));

        // Act
        await pay(CARD);

        // Assert
        expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 1851.75 }), { transaction });
    });

    test('if the database fails, it answers 500 INTERNAL_ERROR and nothing is kept', async () => {
        // Arrange
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const reserva = arrange();
        createPayment.mockRejectedValue(new Error('Lock wait timeout exceeded'));

        // Act
        const res = await pay(CARD);

        // Assert
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('INTERNAL_ERROR');
        expect(reserva.save).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});

describe('Paying the balance of an open stay (HU-27, AC-07 and AC-11)', () => {
    // A finished open stay with $ 4.000 still to pay
    let balance;

    beforeEach(() => {
        balance = { id: 'balance-1', amount: '4000.00', type: 'balance', paymentStatus: 'Pending', update: jest.fn() };
        arrange(reservation({ status: 'Finished', openEnded: true, holdExpiresAt: null }), balance);
    });

    test('a method that does not exist answers 400 INVALID_PAYMENT_METHOD', async () => {
        // Act
        const res = await payBalance({ paymentMethod: 'cash' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PAYMENT_METHOD');
        expect(balance.update).not.toHaveBeenCalled();
    });

    test('a reservation that does not exist answers 404 RESERVATION_NOT_FOUND', async () => {
        // Arrange
        findReservation.mockResolvedValue(null);

        // Act
        const res = await payBalance(CARD);

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
        expect(balance.update).not.toHaveBeenCalled();
    });

    test('a reservation of another user answers 403 RESERVATION_NOT_OWNED', async () => {
        // Arrange
        findReservation.mockResolvedValue(reservation({ userId: OTHER_USER_ID, status: 'Finished' }));

        // Act
        const res = await payBalance(CARD);

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('RESERVATION_NOT_OWNED');
        expect(balance.update).not.toHaveBeenCalled();
    });

    test('without a pending balance it answers 400 NO_PENDING_BALANCE', async () => {
        // Arrange
        findPayment.mockResolvedValue(null);

        // Act
        const res = await payBalance(CARD);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('NO_PENDING_BALANCE');
        expect(findPayment).toHaveBeenCalledWith({
            where: { reservationId: RESERVATION_ID, type: 'balance', paymentStatus: 'Pending' },
            transaction,
        });
    });

    test('a declined card answers 402 PAYMENT_DECLINED and the balance is still pending', async () => {
        // Act
        const res = await payBalance(DECLINED_CARD);

        // Assert
        expect(res.status).toBe(402);
        expect(res.body.code).toBe('PAYMENT_DECLINED');
        expect(balance.update).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test('the balance is paid with the method chosen, inside the transaction of the locked reservation', async () => {
        // Act
        const res = await payBalance(CARD);

        // Assert
        expect(res.status).toBe(200);
        expect(findReservation).toHaveBeenCalledWith(RESERVATION_ID, { transaction, lock: 'UPDATE' });
        expect(balance.update).toHaveBeenCalledWith({
            paymentStatus: 'Paid',
            paymentMethod: 'card',
            cardLastFour: '4242',
            paidAt: NOW,
        }, { transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('PSE keeps no card digits', async () => {
        // Act
        await payBalance({ paymentMethod: 'pse', cardLastFour: '4242' });

        // Assert
        expect(balance.update).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'pse', cardLastFour: null }), { transaction });
    });
});
