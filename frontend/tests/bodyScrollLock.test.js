import { render } from '@testing-library/react';
import ConfirmDialog from '../src/components/ConfirmDialog';
import LogDetailsModal from '../src/components/LogDetailsModal';

// #311: while a dialog is open, the page behind it does not scroll
const LOG = {
    action: 'status_changed',
    details: 'Account status changed to active',
    created_at: '2026-11-10T15:00:00.000Z',
    targetUser: { fullName: 'Laura Gomez' },
    admin: { fullName: 'Administrador PARKEA' },
};

const confirmDialog = (open) => (
    <ConfirmDialog open={open} title="Eliminar vehiculo" message="Esta accion no se puede deshacer." onConfirm={() => {}} onCancel={() => {}} />
);

describe('Scroll of the page behind a dialog (#311)', () => {
    beforeEach(() => {
        document.body.style.overflow = '';
    });

    test('ConfirmDialog locks the scroll of the body while it is open and gives it back when it closes', () => {
        // Act
        const { rerender } = render(confirmDialog(false));
        const before = document.body.style.overflow;
        rerender(confirmDialog(true));
        const whileOpen = document.body.style.overflow;
        rerender(confirmDialog(false));

        // Assert
        expect(before).toBe('');
        expect(whileOpen).toBe('hidden');
        expect(document.body.style.overflow).toBe('');
    });

    test('ConfirmDialog gives the scroll back when it is removed from the page while open', () => {
        // Act
        const { unmount } = render(confirmDialog(true));
        const whileOpen = document.body.style.overflow;
        unmount();

        // Assert
        expect(whileOpen).toBe('hidden');
        expect(document.body.style.overflow).toBe('');
    });

    test('LogDetailsModal locks the scroll of the body while it shows a log and gives it back when it closes', () => {
        // Act
        const { rerender } = render(<LogDetailsModal log={null} onClose={() => {}} />);
        const before = document.body.style.overflow;
        rerender(<LogDetailsModal log={LOG} onClose={() => {}} />);
        const whileOpen = document.body.style.overflow;
        rerender(<LogDetailsModal log={null} onClose={() => {}} />);

        // Assert
        expect(before).toBe('');
        expect(whileOpen).toBe('hidden');
        expect(document.body.style.overflow).toBe('');
    });

    test('with two dialogs open, closing one keeps the page locked until the other closes', () => {
        // Act
        const first = render(confirmDialog(true));
        const second = render(<LogDetailsModal log={LOG} onClose={() => {}} />);
        first.unmount();
        const afterFirst = document.body.style.overflow;
        second.unmount();

        // Assert
        expect(afterFirst).toBe('hidden');
        expect(document.body.style.overflow).toBe('');
    });

    test('it gives back the overflow the page had before the dialog, not an empty one', () => {
        // Arrange
        document.body.style.overflow = 'scroll';

        // Act
        const { unmount } = render(confirmDialog(true));
        const whileOpen = document.body.style.overflow;
        unmount();

        // Assert
        expect(whileOpen).toBe('hidden');
        expect(document.body.style.overflow).toBe('scroll');
    });
});
