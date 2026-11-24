import api from '../src/services/api';
import { getAvailabilityForHours } from '../src/services/zoneService';

// #375: the request of the free spots for some hours, with the real service
// and a mock of the HTTP client, so no test calls the real API
jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('The request of the free spots for some hours (#375)', () => {
    test.each([
        ['a stay with an exit time', { startTime: '2026-11-17T15:00:00.000Z', endTime: '2026-11-17T17:00:00.000Z' }],
        ['an open stay', { startTime: '2026-11-17T15:00:00.000Z', openEnded: true }],
    ])('for %s it sends the hours in the query of GET /zones/:id/availability, with the signal that cancels it', async (_case, hours) => {
        // Arrange
        const response = { data: { availableSlots: 3 } };
        api.get.mockResolvedValue(response);
        const { signal } = new AbortController();

        // Act
        const result = await getAvailabilityForHours('z1', hours, { signal });

        // Assert
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith('/zones/z1/availability', { params: hours, signal });
        expect(result).toBe(response);
    });

    test('without a signal it still asks', async () => {
        // Arrange
        api.get.mockResolvedValue({ data: { availableSlots: 0 } });

        // Act
        await getAvailabilityForHours('z1', { startTime: '2026-11-17T15:00:00.000Z', openEnded: true });

        // Assert
        expect(api.get).toHaveBeenCalledWith('/zones/z1/availability', { params: { startTime: '2026-11-17T15:00:00.000Z', openEnded: true }, signal: undefined });
    });
});
