import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/pages/Home';
import { AuthProvider } from '../src/context/AuthContext';
import { getReservations } from '../src/services/reservationService';
import { getZones } from '../src/services/zoneService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn() }));
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

const HOUR = 60 * 60 * 1000;
const at = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

const reservation = (id, zoneName, status, startHours, endHours) => ({
    id,
    status,
    startTime: at(startHours),
    endTime: endHours === null ? null : at(endHours),
    spotNumber: 4,
    amount: '6000.00',
    zone: { name: zoneName, address: 'Calle 1 # 2-3' },
});

// The fake list answers like the API does: the latest start first, filtered by
// `status` and cut to `limit`. So a screen that asks for the wrong list shows
// the wrong reservation, and the tests below fail.
const answerLikeTheApi = (all) => {
    getReservations.mockImplementation(({ status, limit = 10 } = {}) => {
        const rows = all
            .filter((r) => !status || r.status === status)
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        return Promise.resolve({ data: { reservations: rows.slice(0, limit) } });
    });
};

const renderHome = () => render(
    <MemoryRouter>
        <AuthProvider>
            <Home />
        </AuthProvider>
    </MemoryRouter>,
);

// The history card also lists finished stays, so the checks look only inside this card
const reservationsCard = async () => (await screen.findByText('Tus reservas')).parentElement;

describe('Reservation card of the home (#306)', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gómez', role: 'user' }));
        getReservations.mockReset();
        getZones.mockReset().mockResolvedValue({ data: { zones: [] } });
    });

    test('with a stay running now and another one tomorrow, the card shows the one running', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('tomorrow', 'Zona Mañana', 'Active', 24, 26),
            reservation('running', 'Zona Corriendo', 'Active', -1, 2),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Corriendo')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Mañana')).not.toBeInTheDocument();
    });

    test('an open stay with no exit time yet is shown as the one running', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('tomorrow', 'Zona Mañana', 'Active', 24, 26),
            reservation('open', 'Zona Abierta', 'Active', -3, null),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Abierta')).toBeInTheDocument();
        expect(within(card).getByText(/Sin hora de salida/)).toBeInTheDocument();
        expect(within(card).queryByText('Zona Mañana')).not.toBeInTheDocument();
    });

    test('a new pending reservation and an old finished one: the card shows the pending one', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('old', 'Zona Vieja', 'Finished', -40, -38),
            reservation('pending', 'Zona Pendiente', 'Pending', 2, 4),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Pendiente')).toBeInTheDocument();
        expect(within(card).getByText('Pendiente de pago')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Vieja')).not.toBeInTheDocument();
    });

    test('a pending reservation whose start time already passed is still shown (it can be paid until it expires)', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('old', 'Zona Vieja', 'Finished', -40, -38),
            reservation('pending', 'Zona Pendiente', 'Pending', -0.1, 1),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Pendiente')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Vieja')).not.toBeInTheDocument();
    });

    test('with nothing running or coming, the card shows the last finished one, not a newer cancelled one', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('finished', 'Zona Finalizada', 'Finished', -40, -38),
            reservation('cancelled', 'Zona Cancelada', 'Cancelled', -5, -3),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Finalizada')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Cancelada')).not.toBeInTheDocument();
    });

    test('with no reservations, the card says so', async () => {
        // Arrange
        answerLikeTheApi([]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Aún no tienes reservas registradas.')).toBeInTheDocument();
    });

    test('the card waits for the history before choosing, so it never shows another reservation first', async () => {
        // Arrange: the list answers, the history does not answer yet
        const all = [
            reservation('finished', 'Zona Finalizada', 'Finished', -40, -38),
            reservation('cancelled', 'Zona Cancelada', 'Cancelled', -5, -3),
        ];
        getReservations.mockImplementation(({ status } = {}) => (status
            ? new Promise(() => {})
            : Promise.resolve({ data: { reservations: [all[1], all[0]] } })));
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByRole('status')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Cancelada')).not.toBeInTheDocument();
    });

    test('if the reservations cannot be loaded, the card shows the error', async () => {
        // Arrange
        getReservations.mockImplementation(({ status } = {}) => (status
            ? Promise.resolve({ data: { reservations: [] } })
            : Promise.reject(new Error('Network Error'))));
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByRole('alert')).toBeInTheDocument();
        expect(within(card).queryByText('Aún no tienes reservas registradas.')).not.toBeInTheDocument();
    });

    test('with two finished stays in the history, the card shows the latest one', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('old', 'Zona Antigua', 'Finished', -80, -78),
            reservation('latest', 'Zona Reciente', 'Finished', -10, -8),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Reciente')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Antigua')).not.toBeInTheDocument();
    });

    test('when the history answers after the list, the card still shows the last finished one', async () => {
        // Arrange: a newer cancelled one in the list, and the history comes later
        const finished = reservation('finished', 'Zona Finalizada', 'Finished', -40, -38);
        const cancelled = reservation('cancelled', 'Zona Cancelada', 'Cancelled', -5, -3);
        getReservations.mockImplementation(({ status } = {}) => (status
            ? new Promise((resolve) => setTimeout(() => resolve({ data: { reservations: [finished] } }), 50))
            : Promise.resolve({ data: { reservations: [cancelled, finished] } })));
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Finalizada')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Cancelada')).not.toBeInTheDocument();
    });

    test('the card finds the stay running now among many newer reservations', async () => {
        // Arrange: a stay running now and 12 reservations that start later, all cancelled
        const cancelled = Array.from({ length: 12 }, (_, i) => (
            reservation(`cancelled-${i}`, `Zona Cancelada ${i}`, 'Cancelled', i + 1, i + 2)
        ));
        answerLikeTheApi([...cancelled, reservation('running', 'Zona En Curso', 'Active', -1, 2)]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona En Curso')).toBeInTheDocument();
    });

    test('a pending reservation whose 15 minutes to pay ended shows as expired (#347)', async () => {
        // Arrange: the only one, and the job has not marked it Expired yet
        answerLikeTheApi([{ ...reservation('pending', 'Zona Pendiente', 'Pending', 2, 4), holdExpiresAt: at(-0.01) }]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Pendiente')).toBeInTheDocument();
        expect(within(card).getByText('Expirada')).toBeInTheDocument();
        expect(within(card).queryByText('Pendiente de pago')).not.toBeInTheDocument();
    });
});

describe('The card of the home updates itself while the page is open (#347)', () => {
    // Moves the clock, runs the timers that were due and lets the screen update
    const wait = (ms) => act(async () => {
        jest.advanceTimersByTime(ms);
    });
    const MINUTE = 60 * 1000;
    // Opens the home and lets every answer of the API arrive
    const openHome = () => act(async () => {
        renderHome();
    });

    beforeEach(() => {
        jest.useFakeTimers({ now: new Date('2026-11-16T08:00:00-05:00') });
        localStorage.clear();
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gómez', role: 'user' }));
        getReservations.mockReset();
        getZones.mockReset().mockResolvedValue({ data: { zones: [] } });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // A Pending reservation in 2 hours whose 15 minutes to pay end in 10 minutes
    const waitingForPayment = () => ({ ...reservation('pending', 'Zona Pendiente', 'Pending', 2, 4), holdExpiresAt: at(10 / 60) });

    test('when the 15 minutes to pay end, the card shows it as expired without loading the page', async () => {
        // Arrange: it is the only one
        answerLikeTheApi([waitingForPayment()]);
        await openHome();
        const card = await reservationsCard();
        expect(await within(card).findByText('Pendiente de pago')).toBeInTheDocument();
        const requests = getReservations.mock.calls.length;

        // Act: one second before the end it still waits for the payment
        await wait(10 * MINUTE - 1000);
        expect(within(card).getByText('Pendiente de pago')).toBeInTheDocument();

        // Act: the 15 minutes end
        await wait(1000 + 100);

        // Assert
        expect(within(card).getByText('Zona Pendiente')).toBeInTheDocument();
        expect(within(card).getByText('Expirada')).toBeInTheDocument();
        expect(within(card).queryByText('Pendiente de pago')).not.toBeInTheDocument();
        expect(getReservations).toHaveBeenCalledTimes(requests);
    });

    test('when the 15 minutes to pay end and there is another reservation, the card shows that one', async () => {
        // Arrange: a paid reservation for tomorrow
        answerLikeTheApi([
            reservation('tomorrow', 'Zona Pagada', 'Active', 24, 26),
            waitingForPayment(),
        ]);
        await openHome();
        const card = await reservationsCard();
        expect(await within(card).findByText('Zona Pendiente')).toBeInTheDocument();

        // Act: the 15 minutes end
        await wait(10 * MINUTE + 100);

        // Assert
        expect(within(card).getByText('Zona Pagada')).toBeInTheDocument();
        expect(within(card).getByText('Confirmada')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Pendiente')).not.toBeInTheDocument();
    });

    test('when the stay that runs ends, the card shows the next one', async () => {
        // Arrange: a stay that ends in 30 minutes and another one tomorrow
        answerLikeTheApi([
            reservation('tomorrow', 'Zona Mañana', 'Active', 24, 26),
            reservation('running', 'Zona Corriendo', 'Active', -1, 0.5),
        ]);
        await openHome();
        const card = await reservationsCard();
        expect(await within(card).findByText('Zona Corriendo')).toBeInTheDocument();

        // Act
        await wait(30 * MINUTE + 100);

        // Assert
        expect(within(card).getByText('Zona Mañana')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Corriendo')).not.toBeInTheDocument();
    });
});

describe('The motion of the three homes (#330)', () => {
    // Signs in with the role, or leaves the visitor signed out
    const signIn = (role) => {
        localStorage.clear();
        if (!role) return;
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: `${role}-1`, fullName: 'Laura Gómez', role }));
    };

    beforeEach(() => {
        getReservations.mockReset().mockResolvedValue({ data: { reservations: [] } });
        getZones.mockReset().mockResolvedValue({ data: { zones: [] } });
    });

    test.each([
        ['visitor', null],
        ['user', 'user'],
        ['admin', 'admin'],
    ])('the hero of the %s home appears in steps, and its illustration slides in', async (_, role) => {
        // Arrange
        signIn(role);

        // Act
        renderHome();
        await act(async () => {});

        // Assert: the title, then the text, then the button
        const title = screen.getByRole('heading', { level: 1 });
        const hero = title.closest('section');
        expect(title).toHaveClass('motion-safe:animate-fade-up');
        expect(within(hero).getByText(/^(Encuentra|Desde aquí)/)).toHaveClass('motion-safe:animate-fade-up-2');
        expect(within(hero).getByRole('link')).toHaveClass('motion-safe:animate-fade-up-3');
        expect(hero.querySelector('img')).toHaveClass('motion-safe:animate-hero-illustration');
    });

    // The headings of the three cards of each home
    const CARDS = {
        visitor: ['Reservas', 'Zonas', 'Historial'],
        user: ['Reservas', 'Zonas', 'Historial'],
        admin: ['Panel de control', 'Gestión de zonas', 'Gestión de usuarios'],
    };
    const cards = (home) => CARDS[home].map((name) => screen.getByRole('heading', { name }).closest('.rounded-lg'));
    const STEPS = ['motion-safe:animate-fade-up', 'motion-safe:animate-fade-up-2', 'motion-safe:animate-fade-up-3'];

    describe('with IntersectionObserver', () => {
        let observers;

        beforeEach(() => {
            // A fake one: the test says when each card scrolls into view
            observers = [];
            globalThis.IntersectionObserver = class {
                constructor(callback) {
                    const observer = { callback, observe: (element) => { observer.element = element; }, disconnect: jest.fn() };
                    observers.push(observer);
                    return observer;
                }
            };
        });

        afterEach(() => {
            delete globalThis.IntersectionObserver;
        });

        test.each([
            ['visitor', null],
            ['user', 'user'],
            ['admin', 'admin'],
        ])('the cards of the %s home wait to scroll into view, and then appear one after the other', async (home, role) => {
            // Arrange
            signIn(role);
            renderHome();
            await act(async () => {});
            for (const card of cards(home)) expect(card).toHaveClass('motion-safe:opacity-0');

            // Act: the three of a row scroll into view together
            for (const card of cards(home)) {
                act(() => observers.find((observer) => observer.element === card).callback([{ isIntersecting: true, intersectionRatio: 1 }]));
            }

            // Assert
            cards(home).forEach((card, i) => {
                expect(card).not.toHaveClass('motion-safe:opacity-0');
                expect(card).toHaveClass(STEPS[i]);
            });
        });
    });

    test.each([
        ['visitor', null, false],
        ['user', 'user', true],
        ['admin', 'admin', true],
    ])('on the %s home the main button rises on hover, and so do the cards with an action', async (home, role, cardsAct) => {
        // Arrange
        signIn(role);

        // Act
        renderHome();
        await act(async () => {});

        // Assert: a card without an action (visitor) does not rise, so it does
        // not look like a link; only its icon grows a little
        const hero = screen.getByRole('heading', { level: 1 }).closest('section');
        const button = within(hero).getByRole('link');
        expect(button).toHaveClass('group', 'hover:shadow-md', 'motion-safe:hover:-translate-y-0.5');
        expect(button.querySelector('svg')).toHaveClass('motion-safe:group-hover:scale-110');
        for (const card of cards(home)) {
            expect(card).toHaveClass('group');
            if (cardsAct) {
                expect(card).toHaveClass('hover:shadow-lg', 'motion-safe:hover:-translate-y-1');
                expect(within(card).getByRole('link').querySelector('svg')).toHaveClass('motion-safe:group-hover:translate-x-0.5');
            } else {
                expect(card).not.toHaveClass('hover:shadow-lg');
                expect(card).not.toHaveClass('motion-safe:hover:-translate-y-1');
                expect(card.querySelector('span')).toHaveClass('motion-safe:group-hover:scale-110');
            }
        }
    });

    test.each([
        ['visitor', null],
        ['user', 'user'],
        ['admin', 'admin'],
    ])('without IntersectionObserver the cards of the %s home show at once, without waiting or moving', async (home, role) => {
        // Arrange
        signIn(role);

        // Act
        renderHome();
        await act(async () => {});

        // Assert
        for (const card of cards(home)) {
            expect(card).not.toHaveClass('motion-safe:opacity-0');
            for (const step of STEPS) expect(card).not.toHaveClass(step);
        }
    });
});
