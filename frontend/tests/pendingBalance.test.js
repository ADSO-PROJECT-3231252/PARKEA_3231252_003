import api from '../src/services/api';
import { hasPendingBalance } from '../src/services/reservationService';

jest.mock('../src/services/api', () => ({ get: jest.fn() }));

function page(reservations, totalPages) {
    return { data: { reservations, pagination: { totalPages } } };
}

beforeEach(() => {
    api.get.mockReset();
});

test('finds a balance on the second page and stops before the third', async () => {
    api.get
        .mockResolvedValueOnce(page([{ openStay: null }], 3))
        .mockResolvedValueOnce(page([{ openStay: { pendingBalance: 2000 } }], 3));

    await expect(hasPendingBalance()).resolves.toBe(true);

    expect(api.get).toHaveBeenNthCalledWith(1, '/reservations', {
        params: { status: 'Finished', page: 1, limit: 100 },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/reservations', {
        params: { status: 'Finished', page: 2, limit: 100 },
    });
    expect(api.get).toHaveBeenCalledTimes(2);
});

test('returns false after checking every page when there is no debt', async () => {
    api.get
        .mockResolvedValueOnce(page([{ openStay: { pendingBalance: 0 } }], 2))
        .mockResolvedValueOnce(page([{ openStay: null }], 2));

    await expect(hasPendingBalance()).resolves.toBe(false);
    expect(api.get).toHaveBeenCalledTimes(2);
});

test('an empty history returns false after one request', async () => {
    api.get.mockResolvedValueOnce(page([], 0));

    await expect(hasPendingBalance()).resolves.toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
});

test('missing pagination stops the search after the first page', async () => {
    api.get.mockResolvedValueOnce({ data: { reservations: [] } });
    await expect(hasPendingBalance()).resolves.toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
});
