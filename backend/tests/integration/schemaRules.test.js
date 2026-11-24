// #372: the checks, indexes and required columns of the migrations, against a
// real MySQL database. Each rule is broken with SQL by hand, as a script that
// skips the API would do, and the database must refuse it.
const request = require('supertest');
const { sequelize, Pago, Reserva } = require('../../src/models');
const { expirarReservasVencidas } = require('../../src/jobs/expirar-reservas.job');
const { finalizarReservasVencidas } = require('../../src/jobs/finalizar-reservas.job');
const { app, inMinutes, createUser, createZone, reserve } = require('./helpers');

// MySQL error numbers
const CHECK_VIOLATED = 3819;
const CANNOT_BE_NULL = 1048;
const NO_DEFAULT_VALUE = 1364;
const DUPLICATE_ENTRY = 1062;
const NO_PARENT_ROW = 1452;
const PARENT_ROW_IN_USE = 1451;
const NOT_A_VALUE_OF_THE_ENUM = 1265;

const run = (sql, replacements) => sequelize.query(sql, { replacements });

// The error number of a statement that must fail, or null if it worked
async function errnoOf(sql, replacements) {
    try {
        await run(sql, replacements);
        return null;
    } catch (error) {
        return error.parent?.errno ?? error.original?.errno;
    }
}

describe('Checks, indexes and required columns of the database (#372)', () => {
    let cuenta;
    let zona;
    let reservaId;
    let pagoId;

    beforeAll(async () => {
        // A user with a car, a zone and a paid reservation, so every table
        // of the rules has a row to break
        [cuenta, zona] = await Promise.all([createUser(), createZone(1)]);
        const created = await reserve(cuenta, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());
        reservaId = created.body.reservation.id;
        const paid = await request(app)
            .post(`/api/payments/${reservaId}`)
            .set('Authorization', `Bearer ${cuenta.token}`)
            .send({ paymentMethod: 'pse' });
        if (paid.status !== 200 && paid.status !== 201) throw new Error(`Not paid: ${paid.status} ${JSON.stringify(paid.body)}`);
        pagoId = (await Pago.findOne({ where: { reservationId: reservaId } })).id;
    });

    test('after db:migrate the database lists the eight checks', async () => {
        // Act
        const [rows] = await run(`
            SELECT CONSTRAINT_NAME AS name FROM information_schema.CHECK_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() ORDER BY CONSTRAINT_NAME
        `);

        // Assert
        expect(rows.map((row) => row.name)).toEqual([
            'payments_amount_not_negative',
            'zone_schedules_day_of_week_range',
            'zone_schedules_open_30_minutes',
            'zone_schedules_times_in_day',
            'zone_schedules_whole_minutes',
            'zone_vehicle_types_hourly_rate_positive',
            'zone_vehicle_types_total_slots_range',
            'zones_hourly_rate_positive',
        ]);
    });

    test.each([
        ['a negative payment', 'UPDATE payments SET amount = -0.01 WHERE id = :pago'],
        ['a zone that charges nothing', 'UPDATE zones SET hourly_rate = 0 WHERE id = :zona'],
        ['a negative rate', 'UPDATE zones SET hourly_rate = -2000 WHERE id = :zona'],
    ])('an UPDATE by SQL with %s fails', async (_case, sql) => {
        expect(await errnoOf(sql, { pago: pagoId, zona: zona.id })).toBe(CHECK_VIOLATED);
    });

    test('the limits of the amount and the rate are allowed', async () => {
        // A payment of 0 and a rate of one cent follow the rules
        await run('UPDATE payments SET amount = 0 WHERE id = :pago', { pago: pagoId });
        await run('UPDATE zones SET hourly_rate = 0.01 WHERE id = :zona', { zona: zona.id });
        await run('UPDATE zones SET hourly_rate = 2000 WHERE id = :zona', { zona: zona.id });
    });

    const schedule = (day, opensAt, closesAt) => errnoOf(
        'INSERT INTO zone_schedules (id, zone_id, day_of_week, opens_at, closes_at) VALUES (UUID(), :zona, :day, :opensAt, :closesAt)',
        { zona: zona.id, day, opensAt, closesAt }
    );

    test.each([
        ['day 0', 0, '08:00:00', '18:00:00'],
        ['day 8', 8, '08:00:00', '18:00:00'],
        ['29 minutes open', 1, '08:00:00', '08:29:00'],
        ['closing before opening', 1, '18:00:00', '08:00:00'],
        ['closing at 24:00', 1, '08:00:00', '24:00:00'],
        ['opening before 00:00', 1, '-01:00:00', '08:00:00'],
        ['seconds in the opening', 1, '08:00:30', '18:00:00'],
        ['seconds in the closing', 1, '08:00:00', '17:59:30'],
    ])('a schedule with %s fails', async (_case, day, opensAt, closesAt) => {
        expect(await schedule(day, opensAt, closesAt)).toBe(CHECK_VIOLATED);
    });

    test('the limits of a schedule are allowed', async () => {
        // Day 1 and day 7, 30 minutes exactly, from 00:00 and until 23:59
        expect(await schedule(1, '00:00:00', '00:30:00')).toBeNull();
        expect(await schedule(7, '23:29:00', '23:59:00')).toBeNull();
        await run('DELETE FROM zone_schedules WHERE zone_id = :zona', { zona: zona.id });
    });

    test.each([
        ['users', 'document_type', 'usuario'],
        ['vehicles', 'brand', 'vehiculo'],
        ['vehicles', 'model', 'vehiculo'],
        ['vehicles', 'color', 'vehiculo'],
        ['zones', 'address', 'zona'],
        ['zones', 'latitude', 'zona'],
        ['zones', 'longitude', 'zona'],
    ])('%s.%s cannot be NULL', async (table, column, row) => {
        const ids = { usuario: cuenta.usuario.id, vehiculo: cuenta.vehiculo.id, zona: zona.id };
        expect(await errnoOf(`UPDATE ${table} SET ${column} = NULL WHERE id = :id`, { id: ids[row] })).toBe(CANNOT_BE_NULL);
    });

    test('the phone and the document number stay optional', async () => {
        // Act
        const [rows] = await run(`
            SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('phone', 'document_number')
            ORDER BY COLUMN_NAME
        `);

        // Assert: the first administrator has no phone, and HU-30 frees the
        // document of an old account that is in the admin log
        expect(rows).toEqual([{ name: 'document_number', nullable: 'YES' }, { name: 'phone', nullable: 'YES' }]);
    });

    test('every model says the same as the database about which columns can be NULL', async () => {
        // Arrange
        const [columns] = await run(`
            SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, IS_NULLABLE AS nullable
            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
        `);
        const inDatabase = new Map(columns.map((c) => [`${c.tableName}.${c.columnName}`, c.nullable === 'YES']));

        // Act: every column of every model, against its column in MySQL
        const differences = [];
        for (const model of Object.values(sequelize.models)) {
            for (const attribute of Object.values(model.rawAttributes)) {
                const key = `${model.getTableName()}.${attribute.field}`;
                const inModel = attribute.allowNull !== false && !attribute.primaryKey;
                if (!inDatabase.has(key)) differences.push(`${key} is not in the database`);
                else if (inModel !== inDatabase.get(key)) differences.push(`${key}: the model allows NULL ${inModel}, the database ${inDatabase.get(key)}`);
            }
        }

        // Assert
        expect(differences).toEqual([]);
    });

    test('a reservation saved without its rate fails instead of charging 0.00', async () => {
        // Act: the same reservation, by SQL, without applied_hourly_rate
        const errno = await errnoOf(`
            INSERT INTO reservations (id, user_id, zone_id, vehicle_id, start_time, end_time, spot_number, status, parking_spot_id, open_ended)
            SELECT UUID(), user_id, zone_id, vehicle_id, start_time, end_time, spot_number, 'Cancelled', parking_spot_id, open_ended
            FROM reservations WHERE id = :reserva
        `, { reserva: reservaId });

        // Assert
        expect(errno).toBe(NO_DEFAULT_VALUE);
    });

    // The SELECT of each job, as the job sends it
    async function selectOf(job) {
        const sqls = [];
        const logging = sequelize.options.logging;
        sequelize.options.logging = (sql) => sqls.push(sql.replace(/^Executing \([^)]*\): /, ''));
        try {
            await job();
        } finally {
            sequelize.options.logging = logging;
        }
        return sqls.find((sql) => sql.startsWith('SELECT') && sql.includes('FROM `reservations`'));
    }

    test.each([
        ['expirar-reservas', expirarReservasVencidas, 'reservations_status_hold_expires_at_idx'],
        ['finalizar-reservas', finalizarReservasVencidas, 'reservations_status_end_time_idx'],
    ])('the query of the job %s does not read the whole table', async (_job, job, index) => {
        // Act
        const [[plan]] = await run(`EXPLAIN ${await selectOf(job)}`);

        // Assert: with little data MySQL may pick either index of the status,
        // but its own index is there for it
        expect(plan.type).not.toBe('ALL');
        expect(plan.possible_keys.split(',')).toContain(index);
    });

    test('the password recovery finds the link by its hash with the index', async () => {
        // Act: the same query as passwordReset.controller.js
        const sqls = [];
        await sequelize.models.PasswordResetToken.findOne({
            where: { tokenHash: 'a'.repeat(64) },
            logging: (sql) => sqls.push(sql.replace(/^Executing \([^)]*\): /, '')),
        });
        const [[plan]] = await run(`EXPLAIN ${sqls[0]}`);

        // Assert
        expect(plan.key).toBe('password_reset_tokens_token_hash_idx');
    });

    afterAll(async () => {
        // The reservation of this file is not left for the next files
        await Reserva.update({ status: 'Cancelled' }, { where: { id: reservaId } });
    });
});

describe('The vehicle types of the zones and of the spots in the database (HU-31)', () => {
    let zona;

    // A type of the zone of this block, by SQL
    const addType = (vehicleType, totalSlots = 5, hourlyRate = 3000) => errnoOf(
        'INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate) VALUES (UUID(), :zona, :vehicleType, :totalSlots, :hourlyRate)',
        { zona: zona.id, vehicleType, totalSlots, hourlyRate }
    );
    // A spot of the zone of this block, by SQL
    const addSpot = (vehicleType, spotNumber) => errnoOf(
        "INSERT INTO parking_spots (id, zone_id, vehicle_type, spot_number, status) VALUES (UUID(), :zona, :vehicleType, :spotNumber, 'Available')",
        { zona: zona.id, vehicleType, spotNumber }
    );

    beforeAll(async () => {
        // A zone of 2 spots, created through the API: its car type and its
        // car spots 1 and 2
        zona = await createZone(2);
    });

    afterEach(async () => {
        // Only the car type and the car spots of the API stay
        await run("DELETE FROM parking_spots WHERE zone_id = :zona AND vehicle_type <> 'car'", { zona: zona.id });
        await run("DELETE FROM zone_vehicle_types WHERE zone_id = :zona AND vehicle_type <> 'car'", { zona: zona.id });
    });

    test.each([
        ['no spots', 0, 3000],
        ['more than 500 spots', 501, 3000],
        ['a rate of 0', 5, 0],
        ['a negative rate', 5, -3000],
    ])('a type with %s fails', async (_case, totalSlots, hourlyRate) => {
        expect(await addType('truck', totalSlots, hourlyRate)).toBe(CHECK_VIOLATED);
    });

    test('the limits of the spots and the rate of a type are allowed', async () => {
        expect(await addType('truck', 1, 0.01)).toBeNull();
        expect(await errnoOf("UPDATE zone_vehicle_types SET total_slots = 500 WHERE zone_id = :zona AND vehicle_type = 'truck'", { zona: zona.id })).toBeNull();
    });

    test('a type is taken unless it is turned off', async () => {
        // Act
        await addType('truck');
        const [[row]] = await run("SELECT is_accepting AS accepting FROM zone_vehicle_types WHERE zone_id = :zona AND vehicle_type = 'truck'", { zona: zona.id });

        // Assert
        expect(row.accepting).toBe(1);
    });

    test('a zone has each type only once', async () => {
        expect(await addType('truck')).toBeNull();
        expect(await addType('truck')).toBe(DUPLICATE_ENTRY);
    });

    test('a type that does not exist fails', async () => {
        expect(await addType('bicycle')).toBe(NOT_A_VALUE_OF_THE_ENUM);
    });

    test('a type of a zone that does not exist fails', async () => {
        // Act
        const errno = await errnoOf(
            "INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate) VALUES (UUID(), UUID(), 'car', 5, 3000)"
        );

        // Assert
        expect(errno).toBe(NO_PARENT_ROW);
    });

    test('a spot of a type that its zone does not have fails', async () => {
        expect(await addSpot('motorcycle', 1)).toBe(NO_PARENT_ROW);
    });

    test('the spots are numbered per type: a motorcycle spot 1 next to the car spot 1, but only one of each', async () => {
        // Arrange
        await addType('motorcycle');

        // Act + Assert
        expect(await addSpot('motorcycle', 1)).toBeNull();
        expect(await addSpot('motorcycle', 1)).toBe(DUPLICATE_ENTRY);
        expect(await addSpot('car', 1)).toBe(DUPLICATE_ENTRY);
    });

    test('a type that has spots cannot be removed: it is turned off instead', async () => {
        // Arrange
        await addType('motorcycle');
        await addSpot('motorcycle', 1);

        // Act
        const errno = await errnoOf("DELETE FROM zone_vehicle_types WHERE zone_id = :zona AND vehicle_type = 'motorcycle'", { zona: zona.id });

        // Assert
        expect(errno).toBe(PARENT_ROW_IN_USE);
    });

    test('the type of a spot cannot become one that its zone does not have', async () => {
        // Act
        const errno = await errnoOf("UPDATE parking_spots SET vehicle_type = 'truck' WHERE zone_id = :zona AND spot_number = 2", { zona: zona.id });

        // Assert
        expect(errno).toBe(NO_PARENT_ROW);
    });

    test('a spot written without its type is a car spot', async () => {
        // Act: like the seeders, which do not say it yet
        await run("INSERT INTO parking_spots (id, zone_id, spot_number, status) VALUES (UUID(), :zona, 3, 'Disabled')", { zona: zona.id });
        const [[spot]] = await run('SELECT vehicle_type AS vehicleType FROM parking_spots WHERE zone_id = :zona AND spot_number = 3', { zona: zona.id });
        await run('DELETE FROM parking_spots WHERE zone_id = :zona AND spot_number = 3', { zona: zona.id });

        // Assert
        expect(spot.vehicleType).toBe('car');
    });

    test('removing a zone removes its spots and its types', async () => {
        // Arrange: a zone of its own, with no reservations, and a second type
        const otra = await createZone(3);
        await run("INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate) VALUES (UUID(), :zona, 'truck', 1, 5000)", { zona: otra.id });

        // Act
        await run('DELETE FROM zones WHERE id = :zona', { zona: otra.id });
        const [[left]] = await run(`
            SELECT (SELECT COUNT(*) FROM parking_spots WHERE zone_id = :zona) AS spots,
                (SELECT COUNT(*) FROM zone_vehicle_types WHERE zone_id = :zona) AS types
        `, { zona: otra.id });

        // Assert
        expect(left).toEqual({ spots: 0, types: 0 });
    });
});
