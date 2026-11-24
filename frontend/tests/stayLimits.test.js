import {
    EXTEND_FINAL_CODES,
    canExtendStay,
    extendErrorMessage,
    extendLimitMs,
    extensionOptions,
    extensionProblem,
    limitedByClosing,
    spotFreeUntil,
} from '../src/utils/extendStay';
import { openStayCharge, stayEndSoFar } from '../src/utils/openStay';
import { formatDate, formatTime, keepTogether } from '../src/utils/format';

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

// #373: a stay never changes spot, so when the spot has another reservation
// later, the API answers SPOT_RESERVED_LATER with freeUntil: 10 minutes before
// that reservation. Here the next one starts at 4:00 p. m.
describe('Extending a stay until the next reservation of its spot (#373, #375)', () => {
    const FREE_UNTIL = iso('15:50');
    const time = (value) => keepTogether(formatTime(value));
    const spot = (freeUntil) => ({ freeUntil, from: iso('12:00') });

    test('the options stop at the time the spot is free', () => {
        // Act
        const options = extensionOptions(reservation(undefined), FREE_UNTIL);
        // Assert: every hour from 1:00 p. m. to 3:00 p. m., and then 3:50 p. m.
        expect(options).toEqual([iso('13:00'), iso('14:00'), iso('15:00'), iso('15:50')]);
    });

    test('an earlier closing time of the zone is still the limit', () => {
        expect(extensionOptions(reservation(iso('14:30')), FREE_UNTIL)).toEqual([iso('13:00'), iso('14:00'), iso('14:30')]);
    });

    test.each([iso('12:00'), iso('11:55')])('there are no options when the spot is not free after the exit time (%s)', (freeUntil) => {
        expect(extensionOptions(reservation(undefined), freeUntil)).toEqual([]);
    });

    test('without freeUntil the options do not change', () => {
        expect(extensionOptions(reservation(undefined), null)).toEqual(extensionOptions(reservation(undefined)));
    });

    test('spotFreeUntil gives the time only when it is after the current exit', () => {
        expect(spotFreeUntil(FREE_UNTIL, iso('12:00'))).toBe(FREE_UNTIL);
        expect(spotFreeUntil(iso('12:00'), iso('12:00'))).toBeNull();
        expect(spotFreeUntil(undefined, iso('12:00'))).toBeNull();
        expect(spotFreeUntil('not a date', iso('12:00'))).toBeNull();
    });

    test('the message says until when the stay can be extended', () => {
        const message = extendErrorMessage('SPOT_RESERVED_LATER', false, null, spot(FREE_UNTIL));
        expect(message).toBe(`Tu cupo tiene otra reserva más tarde. Puedes ampliar hasta las ${time(FREE_UNTIL)}`);
    });

    test('switching to an open stay says why it cannot be one, and until when it can be extended', () => {
        const message = extendErrorMessage('SPOT_RESERVED_LATER', true, null, spot(FREE_UNTIL));
        expect(message).toBe(
            'Tu cupo tiene otra reserva más tarde, así que esta reserva no puede quedar en tiempo indefinido. ' +
            `Puedes ampliarla hasta las ${time(FREE_UNTIL)}`,
        );
    });

    test('on another day than the exit time it also says the date', () => {
        // Arrange: free until the same time of the next day (a whole day
        // later, so it is another date in any time zone)
        const nextDay = new Date(colombia('12:00').getTime() + 24 * HOUR).toISOString();
        expect(formatDate(nextDay)).not.toBe(formatDate(iso('12:00')));
        // Act
        const message = extendErrorMessage('SPOT_RESERVED_LATER', false, null, spot(nextDay));
        // Assert
        expect(message).toBe(`Tu cupo tiene otra reserva más tarde. Puedes ampliar hasta el ${keepTogether(formatDate(nextDay))} a las ${time(nextDay)}`);
    });

    test.each([false, true])('when the spot is not free after the exit time it says the stay cannot be extended (open stay: %s)', (toOpenStay) => {
        const message = extendErrorMessage('SPOT_RESERVED_LATER', toOpenStay, null, spot(iso('11:55')));
        expect(message).toBe('Tu cupo tiene otra reserva poco después de tu salida, así que esta estadía no se puede ampliar');
    });

    test('without freeUntil it gives the general text', () => {
        expect(extendErrorMessage('SPOT_RESERVED_LATER')).toBe(
            'Tu cupo tiene otra reserva más tarde, así que no se puede ampliar hasta esa hora. Elige una hora de salida más temprana',
        );
        expect(extendErrorMessage('SPOT_RESERVED_LATER', true)).toBe(
            'Tu cupo tiene otra reserva más tarde, así que esta reserva no puede quedar en tiempo indefinido',
        );
    });

    test('the same extension cannot go on after it', () => {
        expect(EXTEND_FINAL_CODES).toContain('SPOT_RESERVED_LATER');
    });
});
