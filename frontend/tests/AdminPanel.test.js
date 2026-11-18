import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPanel from '../src/pages/AdminPanel';
import {
    getDashboardMetrics,
    getReservationsByZone,
    getZoneOccupancy,
    getPaymentsStatus,
    getRecentPayments,
    getDashboardAlerts,
} from '../src/services/adminService';

// The panel does not call the real API
jest.mock('../src/services/adminService', () => ({
    getDashboardMetrics: jest.fn(),
    getReservationsByZone: jest.fn(),
    getZoneOccupancy: jest.fn(),
    getPaymentsStatus: jest.fn(),
    getRecentPayments: jest.fn(),
    getDashboardAlerts: jest.fn(),
}));

// jsdom has no layout, so the chart is given the width each test needs: the
// container reports it like the real one, and the tooltip shows the place and
// the style it got
let mockChartWidth = 640;
jest.mock('recharts', () => {
    const actual = jest.requireActual('recharts');
    const { cloneElement, useEffect } = jest.requireActual('react');
    return {
        ...actual,
        ResponsiveContainer: ({ onResize, children }) => {
            useEffect(() => {
                onResize?.(mockChartWidth, 260);
            }, [onResize]);
            return (
                <div className="recharts-responsive-container">
                    {cloneElement(children, { width: mockChartWidth, height: 260 })}
                </div>
            );
        },
        Tooltip: ({ position, contentStyle }) => (
            <text data-testid="zone-tooltip" data-position={JSON.stringify(position ?? null)} data-style={JSON.stringify(contentStyle)} />
        ),
    };
});

// #309: the labels, the chart and the long names of the admin panel, with 7
// zones and one of them with a very long name (100 characters, the most a
// zone name can have).
const LONG_NAME = 'Parqueadero Público Municipal del Centro Comercial y Empresarial Gran Plaza de Dosquebradas Etapa 22';
const ZONE_NAMES = ['Centro', 'Norte', 'Sur', 'La Pradera', 'El Poblado', 'Terminal', LONG_NAME];

const reservationsByZone = ZONE_NAMES.map((zoneName, i) => ({ zoneId: `zone-${i}`, zoneName, reservationCount: i + 1 }));
const occupancy = ZONE_NAMES.map((zoneName, i) => ({ zoneId: `zone-${i}`, zoneName, totalSlots: 10, occupiedSlots: i }));

// One payment of each status
const payment = (id, paymentStatus) => ({
    id,
    amount: '4000.00',
    paidAt: '2026-11-16T13:00:00.000Z',
    paymentMethod: 'card',
    paymentStatus,
    reservation: { user: { fullName: 'Laura Gómez' }, zone: { name: 'Centro' } },
});
const recentPayments = [
    payment('p1', 'Paid'),
    payment('p2', 'Pending'),
    payment('p3', 'Cancelled'),
    payment('p4', 'Refunded'),
];

function answer({ zones = reservationsByZone } = {}) {
    getDashboardMetrics.mockResolvedValue({
        data: { metrics: { activeReservations: 1, revenue: 4000, activeZones: 7, registeredUsers: 3 } },
    });
    getReservationsByZone.mockResolvedValue({ data: { reservationsByZone: zones } });
    getZoneOccupancy.mockResolvedValue({ data: { occupancy } });
    getPaymentsStatus.mockResolvedValue({ data: { paymentStatus: { Paid: 3, Pending: 1, Cancelled: 0, Refunded: 2 } } });
    getRecentPayments.mockResolvedValue({ data: { recentPayments } });
    getDashboardAlerts.mockResolvedValue({ data: { alerts: [] } });
}

const renderPanel = () => render(
    <MemoryRouter>
        <AdminPanel />
    </MemoryRouter>,
);

// The box of a section, found by its title
const section = async (title) => (await screen.findByRole('heading', { name: title })).closest('section');

// The box the chart is drawn in: its height is set by the panel
const chartBox = (box) => box.querySelector('.recharts-responsive-container').parentElement;

beforeEach(() => {
    jest.clearAllMocks();
    mockChartWidth = 640;
});

describe('"Reservas por zona" (#309)', () => {
    test('with 7 zones the chart grows so each one has its own row', async () => {
        // Arrange
        answer();

        // Act
        renderPanel();
        const box = await section('Reservas por zona');
        await within(box).findByRole('table', { hidden: true });

        // Assert: 7 rows of 36 px and 40 px for the numbers under the bars
        expect(chartBox(box)).toHaveStyle({ height: '292px' });
    });

    test('with few zones it keeps the height it had', async () => {
        // Arrange
        answer({ zones: reservationsByZone.slice(0, 2) });

        // Act
        renderPanel();
        const box = await section('Reservas por zona');
        await within(box).findByRole('table', { hidden: true });

        // Assert
        expect(chartBox(box)).toHaveStyle({ height: '260px' });
    });

    test('the axis shows every zone; a long name is cut with "…" and its title has it complete', async () => {
        // Arrange
        answer();

        // Act
        renderPanel();
        const box = await section('Reservas por zona');
        await within(box).findByText('Parqueadero Púb…');

        // Assert: the names of the axis of the zones
        const axis = box.querySelector('.recharts-yAxis-tick-labels');
        const names = [...axis.querySelectorAll('text.recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent);
        expect(names).toEqual([...ZONE_NAMES.slice(0, 6), 'Parqueadero Púb…']);
        expect([...axis.querySelectorAll('title')].map((title) => title.textContent)).toEqual([LONG_NAME]);
    });

    test('the table for screen readers keeps the complete names', async () => {
        // Arrange
        answer();

        // Act
        renderPanel();
        const box = await section('Reservas por zona');

        // Assert
        const table = await within(box).findByRole('table', { hidden: true });
        expect(within(table).getByText(LONG_NAME)).toBeInTheDocument();
        expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(ZONE_NAMES.length + 1);
    });
});

describe('The tooltip of a bar, with the complete name (#309)', () => {
    test('on a narrow chart (a 320 px screen) it starts at the left edge, so it does not go out of the screen', async () => {
        // Arrange
        mockChartWidth = 220;
        answer();

        // Act
        renderPanel();
        const tooltip = await screen.findByTestId('zone-tooltip');

        // Assert
        expect(JSON.parse(tooltip.dataset.position)).toEqual({ x: 0 });
        expect(JSON.parse(tooltip.dataset.style)).toEqual({ maxWidth: 200, whiteSpace: 'normal', overflowWrap: 'anywhere' });
    });

    test('on a wide chart it keeps the place Recharts gives it, after the names', async () => {
        // Arrange
        answer();

        // Act
        renderPanel();
        const tooltip = await screen.findByTestId('zone-tooltip');

        // Assert
        expect(JSON.parse(tooltip.dataset.position)).toBeNull();
        expect(JSON.parse(tooltip.dataset.style)).toEqual({ maxWidth: 200, whiteSpace: 'normal', overflowWrap: 'anywhere' });
    });
});

describe('"Pagos recientes" and "Estado de pagos" (#309)', () => {
    test('each payment says its status in singular', async () => {
        // Arrange
        answer();

        // Act
        renderPanel();
        const table = await within(await section('Pagos recientes')).findByRole('table');

        // Assert
        const statuses = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').at(-1).textContent);
        expect(statuses).toEqual(['Pagado', 'Pendiente', 'Cancelado', 'Reembolsado']);
    });

    test('the summary still counts them in plural', async () => {
        // Arrange
        answer();

        // Act
        renderPanel();
        const box = await section('Estado de pagos');

        // Assert
        for (const label of ['Pagados', 'Pendientes', 'Cancelados', 'Reembolsados']) {
            expect(await within(box).findByText(label)).toBeInTheDocument();
        }
    });
});

describe('"Ocupación por zona" (#309)', () => {
    test('a long name goes on to the next line instead of being cut', async () => {
        // Arrange
        answer();

        // Act
        renderPanel();
        const box = await section('Ocupación por zona');

        // Assert
        const name = await within(box).findByText(LONG_NAME);
        expect(name).toHaveClass('min-w-0', 'break-words');
        expect(name).not.toHaveClass('truncate');
    });
});
