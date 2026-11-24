import {
    closingOf,
    colombiaDay,
    colombiaTime,
    entryProblem,
    exitProblem,
    formatHour,
    hoursErrorMessage,
    hoursSentence,
    todayHoursLabel,
    weekHours,
} from '../src/utils/zoneHours';

// HU-29: the hours are in Colombia time (UTC-5). 2026-11-16 is a Monday.
const colombia = (date, time) => new Date(`${date}T${time}:00-05:00`);
const MONDAY = '2026-11-16';
const TUESDAY = '2026-11-17';
const WEDNESDAY = '2026-11-18';
// The spaces inside "6:00 a. m." are non-breaking, so the time never splits
const nb = (text) => text.replace(/ (?=a\.|p\.|m\.)/g, ' ');

// Open Monday and Tuesday from 6:00 a. m. to 8:00 p. m., and Friday from
// 7:00 a. m. to 1:00 p. m.; closed the other days
const custom = {
    open24h: false,
    schedule: [
        { day: 1, opensAt: '06:00', closesAt: '20:00' },
        { day: 2, opensAt: '06:00', closesAt: '20:00' },
        { day: 5, opensAt: '07:00', closesAt: '13:00' },
    ],
};
const open24h = { open24h: true, schedule: [] };

describe('formatHour', () => {
    test.each([
        ['06:00', '6:00 a. m.'],
        ['20:00', '8:00 p. m.'],
        ['12:00', '12:00 p. m.'],
        ['00:00', '12:00 a. m.'],
        ['23:59', '11:59 p. m.'],
        ['07:30', '7:30 a. m.'],
    ])('%s is %s', (time, text) => {
        expect(formatHour(time)).toBe(nb(text));
    });
});

describe('colombiaDay and colombiaTime', () => {
    test('8:00 p. m. on Monday in Colombia is still Monday, although it is Tuesday in UTC', () => {
        // Arrange
        const date = colombia(MONDAY, '20:00');
        // Act + Assert
        expect(date.toISOString()).toBe('2026-11-17T01:00:00.000Z');
        expect(colombiaDay(date).day).toBe(1);
        expect(colombiaTime(date)).toBe('20:00');
    });

    test('Sunday is 7', () => {
        expect(colombiaDay(colombia('2026-11-22', '10:00')).day).toBe(7);
    });
});

describe('todayHoursLabel (AC-06)', () => {
    test('a zone open 24 hours', () => {
        expect(todayHoursLabel(open24h, colombia(MONDAY, '10:00'))).toBe('Abierta 24 horas');
    });

    test('the hours of today', () => {
        expect(todayHoursLabel(custom, colombia(MONDAY, '22:00'))).toBe(nb('Hoy: 6:00 a. m. – 8:00 p. m.'));
    });

    test('closed today, opening tomorrow', () => {
        expect(todayHoursLabel(custom, colombia('2026-11-15', '10:00'))).toBe(nb('Cerrada hoy · Abre mañana a las 6:00 a. m.'));
    });

    test('closed today, opening another day of the week', () => {
        expect(todayHoursLabel(custom, colombia(WEDNESDAY, '10:00'))).toBe(nb('Cerrada hoy · Abre el viernes a las 7:00 a. m.'));
    });
});

describe('weekHours (AC-06)', () => {
    test('one line per day, Monday to Sunday', () => {
        // Act
        const week = weekHours(custom);
        // Assert
        expect(week.map((d) => d.name)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
        expect(week[0].text).toBe(nb('6:00 a. m. – 8:00 p. m.'));
        expect(week[2].text).toBe('Cerrada');
    });
});

describe('hoursSentence and hoursErrorMessage (AC-03)', () => {
    test.each([
        [{ day: 2, opensAt: '06:00', closesAt: '20:00' }, 'El martes esta zona abre de 6:00 a. m. a 8:00 p. m.'],
        [{ day: 1, closed: true }, 'Esta zona no abre los lunes.'],
        [{ day: 6, closed: true }, 'Esta zona no abre los sábados.'],
        [{ day: 7, closed: true }, 'Esta zona no abre los domingos.'],
    ])('%o', (hours, text) => {
        expect(hoursSentence(hours)).toBe(nb(text));
    });

    test('without hours there is no sentence', () => {
        expect(hoursSentence(undefined)).toBeNull();
        expect(hoursErrorMessage('OUTSIDE_ZONE_HOURS', undefined)).toBeNull();
    });

    test('OUTSIDE_ZONE_HOURS adds the rule of the 30 minutes', () => {
        expect(hoursErrorMessage('OUTSIDE_ZONE_HOURS', { day: 2, opensAt: '06:00', closesAt: '20:00' })).toBe(
            nb('El martes esta zona abre de 6:00 a. m. a 8:00 p. m. La reserva debe quedar dentro de ese horario, con la entrada al menos 30 minutos antes del cierre.'),
        );
    });

    test('ZONE_CLOSED_THAT_DAY says the day is closed', () => {
        expect(hoursErrorMessage('ZONE_CLOSED_THAT_DAY', { day: 3, closed: true })).toBe('Esta zona no abre los miércoles.');
    });
});

describe('entryProblem, exitProblem and closingOf (AC-03, AC-04)', () => {
    test.each([
        ['at the opening time', '06:00'],
        ['30 minutes before closing', '19:30'],
    ])('accepts the entry %s', (_label, time) => {
        expect(entryProblem(custom, colombia(MONDAY, time))).toBeNull();
    });

    test.each([
        ['before the opening time', '05:59'],
        ['29 minutes before closing', '19:31'],
        ['after the closing time', '21:00'],
    ])('rejects the entry %s, with the hours and the last entry', (_label, time) => {
        expect(entryProblem(custom, colombia(MONDAY, time))).toBe(
            nb('El lunes esta zona abre de 6:00 a. m. a 8:00 p. m. La entrada puede ser hasta las 7:30 p. m.'),
        );
    });

    test('rejects a closed day', () => {
        expect(entryProblem(custom, colombia(WEDNESDAY, '10:00'))).toBe('Esta zona no abre los miércoles.');
    });

    test('the exit can be at the closing time, not after', () => {
        expect(exitProblem(custom, colombia(MONDAY, '10:00'), colombia(MONDAY, '20:00'))).toBeNull();
        expect(exitProblem(custom, colombia(MONDAY, '10:00'), colombia(MONDAY, '20:01'))).toBe(
            nb('El lunes esta zona cierra a las 8:00 p. m. La salida debe ser hasta esa hora.'),
        );
    });

    test('the exit cannot go on into the next day', () => {
        expect(exitProblem(custom, colombia(MONDAY, '19:00'), colombia(TUESDAY, '07:00'))).not.toBeNull();
    });

    test('an open stay ends at the closing time of its day', () => {
        expect(closingOf(custom, colombia(MONDAY, '19:30')).toISOString()).toBe('2026-11-17T01:00:00.000Z');
    });

    test('a zone open 24 hours has no limits', () => {
        expect(entryProblem(open24h, colombia(WEDNESDAY, '03:00'))).toBeNull();
        expect(exitProblem(open24h, colombia(WEDNESDAY, '23:00'), colombia('2026-11-19', '05:00'))).toBeNull();
        expect(closingOf(open24h, colombia(WEDNESDAY, '03:00'))).toBeNull();
    });
});
