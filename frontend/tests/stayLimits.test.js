import {
    canExtendStay,
    extendErrorMessage,
    extendLimitMs,
    extensionOptions,
    extensionProblem,
    limitedByClosing,
} from '../src/utils/extendStay';
import { openStayCharge, stayEndSoFar } from '../src/utils/openStay';

// HU-29: a stay in a zone that is not open 24 hours ends at the closing time
// of its zone. The API sends that moment as latestEndTime. 2026-11-16 is a
// Monday; the zone closes at 8:00 p. m. (01:00 UTC of the next day).
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`);
const iso = (time) => colombia(time).toISOString();
const HOUR = 60 * 60 * 1000;

// A paid reservation from 10:00 a. m. to 12:00 p. m.
const reservation = (latestEndTime) => ({
    id: 'r1',
    status: 'Active',
    openEnded: false,
    startTime: iso('10:00'),
    endTime: iso('12:00'),
    latestEndTime,
});

describe('Extending a stay up to the closing time (HU-29, AC-05)', () => {
    test('the limit is the closing time sent by the API', () => {
        // Arrange
        const r = reservation(iso('20:00'));
        // Act + Assert
        expect(extendLimitMs(r)).toBe(colombia('20:00').getTime());
        expect(limitedByClosing(r)).toBe(true);
    });

    test('without latestEndTime it keeps the 24 hours from the entry', () => {
        // Arrange
        const r = reservation(undefined);
        // Act + Assert
        expect(extendLimitMs(r)).toBe(colombia('10:00').getTime() + 24 * HOUR);
        expect(limitedByClosing(r)).toBe(false);
    });

    test('in a zone open 24 hours latestEndTime is the entry + 24 hours, not a closing time', () => {
        const r = reservation(new Date(colombia('10:00').getTime() + 24 * HOUR).toISOString());
        expect(limitedByClosing(r)).toBe(false);
    });

    test('the options stop at the closing time', () => {
        // Act
        const options = extensionOptions(reservation(iso('19:30')));
        // Assert: every hour from 1:00 p. m. to 7:00 p. m., and then 7:30 p. m.
        expect(options[0]).toBe(iso('13:00'));
        expect(options[options.length - 2]).toBe(iso('19:00'));
        expect(options[options.length - 1]).toBe(iso('19:30'));
    });

    test('an exit after the closing time is OUTSIDE_ZONE_HOURS, as the API would answer', () => {
        const problem = extensionProblem(reservation(iso('20:00')), iso('12:00'), iso('21:00'), colombia('11:00').getTime());
        expect(problem).toBe('OUTSIDE_ZONE_HOURS');
    });

    test('a stay whose exit is already the closing time cannot be extended', () => {
        const r = { ...reservation(iso('20:00')), endTime: iso('20:00') };
        expect(canExtendStay(r, colombia('11:00').getTime())).toBe(false);
    });

    test('the message names the hours of that day', () => {
        // Act
        const message = extendErrorMessage('OUTSIDE_ZONE_HOURS', false, { day: 1, opensAt: '06:00', closesAt: '20:00' });
        // Assert
        expect(message).toBe('El lunes esta zona abre de 6:00 a. m. a 8:00 p. m. La salida no puede pasar de la hora de cierre de la zona');
    });

    test('a day the zone no longer opens says the stay cannot be extended', () => {
        const message = extendErrorMessage('ZONE_CLOSED_THAT_DAY', true, { day: 1, closed: true });
        expect(message).toBe('Esta zona no abre los lunes. Por eso esta reserva ya no se puede ampliar');
    });
});

describe('An open stay is never counted past its closing time (HU-29, AC-04)', () => {
    // An open stay that started at 6:00 p. m. and ends by itself at 8:00 p. m.
    const start = iso('18:00');
    const latest = iso('20:00');

    test('the time so far stops at the closing time', () => {
        expect(stayEndSoFar(start, colombia('20:40').getTime(), latest)).toBe(colombia('20:00').getTime());
    });

    test('the amount so far stops at the closing time', () => {
        // Act
        const charge = openStayCharge(start, '2000.00', colombia('20:40').getTime(), 2000, latest);
        // Assert
        expect(charge).toMatchObject({ chargedHours: 2, total: 4000, balance: 2000, usedMinutes: 120 });
    });

    test('without latestEndTime it keeps the 24 hours', () => {
        const charge = openStayCharge(start, '2000.00', colombia('20:40').getTime(), 2000);
        expect(charge.chargedHours).toBe(3);
    });
});
