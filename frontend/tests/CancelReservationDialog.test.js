import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CancelReservationDialog from '../src/components/CancelReservationDialog';
import { cancelReservation } from '../src/services/reservationService';

// The dialog does not call the real API
jest.mock('../src/services/reservationService', () => ({ cancelReservation: jest.fn() }));

// HU-16: when the backend says no, the dialog shows why, and the screen
// behind it is loaded again only if what it shows is out of date.
const pending = {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    status: 'Pending',
    startTime: '2026-11-16T10:00:00-05:00',
    endTime: '2026-11-16T12:00:00-05:00',
    zone: { name: 'Centro' },
};

function openDialog() {
    const onClose = jest.fn();
    const onCancelled = jest.fn();
    render(<CancelReservationDialog reservation={pending} onClose={onClose} onCancelled={onCancelled} />);
    return { onClose, onCancelled };
}

const rejectWith = (code) => cancelReservation.mockRejectedValue({ response: { data: { code } } });

beforeEach(() => {
    cancelReservation.mockReset();
});

describe('Cancelling a reservation whose 15 minutes to pay ended (#347)', () => {
    test('the dialog explains it expired, and closing it loads the screen again', async () => {
        // Arrange: the 15 minutes ended while the dialog was open
        const user = userEvent.setup();
        rejectWith('RESERVATION_EXPIRED');
        const { onClose, onCancelled } = openDialog();

        // Act
        await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Esta reserva expiró porque no se pagó a tiempo. Realiza una nueva reserva'
        );
        expect(onCancelled).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Conservar reserva' }));
        expect(onClose).toHaveBeenCalledWith({ stale: true });
    });

    test.each(['RESERVATION_ALREADY_STARTED', 'RESERVATION_NOT_CANCELLABLE', 'RESERVATION_NOT_FOUND'])(
        'the other codes that mean the screen is out of date still load it again (%s)',
        async (code) => {
            // Arrange
            const user = userEvent.setup();
            rejectWith(code);
            const { onClose } = openDialog();

            // Act
            await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
            await screen.findByRole('alert');
            await user.click(screen.getByRole('button', { name: 'Conservar reserva' }));

            // Assert
            expect(onClose).toHaveBeenCalledWith({ stale: true });
        }
    );

    test.each([
        ['a network error', new Error('Network Error')],
        ['an error of the server (INTERNAL_ERROR)', { response: { data: { code: 'INTERNAL_ERROR' } } }],
    ])('%s does not load the screen again', async (_label, failure) => {
        // Arrange
        const user = userEvent.setup();
        cancelReservation.mockRejectedValue(failure);
        const { onClose } = openDialog();

        // Act
        await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
        await screen.findByRole('alert');
        await user.click(screen.getByRole('button', { name: 'Conservar reserva' }));

        // Assert
        expect(onClose).toHaveBeenCalledWith({ stale: false });
    });
});
