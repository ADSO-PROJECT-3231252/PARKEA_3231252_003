const { safeRollback } = require('../src/utils/transaction');

// #371: what happens when a transaction opened by hand fails. When MySQL finds
// a deadlock it undoes the transaction itself, and Sequelize marks it as
// rolled back before the error reaches the catch.
const ROLLBACK_OF_ENDED = 'Transaction cannot be rolled back because it has been finished';

// Like a Sequelize transaction: rolling back one that already ended throws
function fakeTransaction(finished) {
    return {
        LOCK: { UPDATE: 'UPDATE' },
        finished,
        commit: jest.fn(async function commit() {
            this.finished = 'commit';
        }),
        rollback: jest.fn(async function rollback() {
            if (this.finished) throw new Error(`${ROLLBACK_OF_ENDED} with state: ${this.finished}`);
            this.finished = 'rollback';
        }),
    };
}

let transaction;
let logged;

beforeEach(() => {
    transaction = fakeTransaction();
    logged = [];
    jest.spyOn(console, 'error').mockImplementation((...args) => {
        logged.push(args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '));
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('safeRollback', () => {
    test('rolls back a transaction that has not ended', async () => {
        // Act
        await safeRollback(transaction);

        // Assert
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['that MySQL already undid (deadlock)', 'rollback'],
        ['that was already committed', 'commit'],
    ])('leaves a transaction %s as it is, without an error', async (_label, finished) => {
        // Arrange
        const ended = fakeTransaction(finished);

        // Act and assert
        await expect(safeRollback(ended)).resolves.toBeUndefined();
        expect(ended.rollback).not.toHaveBeenCalled();
    });

    test('never throws: if the rollback itself fails, it goes to the log', async () => {
        // Arrange
        transaction.rollback.mockRejectedValue(new Error('Connection lost'));

        // Act and assert
        await expect(safeRollback(transaction)).resolves.toBeUndefined();
        expect(logged.join('\n')).toContain('Connection lost');
    });

    test('without a transaction it does nothing', async () => {
        await expect(safeRollback(undefined)).resolves.toBeUndefined();
    });
});
