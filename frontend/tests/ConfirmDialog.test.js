import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmDialog from '../src/components/ConfirmDialog';

// #361: the dialog while the action it confirms is running ("confirming")
const onCancel = jest.fn();
const onConfirm = jest.fn();

// The dialog with the same props, confirming or not
const dialog = (confirming) => (
    <ConfirmDialog
        open
        title="Cancelar reserva"
        message="¿Seguro?"
        confirmLabel="Cancelar reserva"
        cancelLabel="Conservar reserva"
        confirming={confirming}
        onConfirm={onConfirm}
        onCancel={onCancel}
    />
);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('ConfirmDialog while it confirms (#361)', () => {
    test('Escape does not close it while confirming, and closes it once when it ends', () => {
        // Arrange
        const { rerender } = render(dialog(false));

        // Act + Assert: confirming, Escape does nothing
        rerender(dialog(true));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).not.toHaveBeenCalled();

        // Act + Assert: when it ends, Escape closes it once
        rerender(dialog(false));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    test('the focus stays on the cancel button while it confirms', () => {
        const { rerender } = render(dialog(false));
        const keep = screen.getByRole('button', { name: 'Conservar reserva' });
        expect(keep).toHaveFocus();
        rerender(dialog(true));
        rerender(dialog(false));
        expect(keep).toHaveFocus();
    });

    test('when the action fails, the focus goes back to the cancel button', () => {
        // Arrange: the confirm button was clicked
        const { rerender } = render(dialog(false));
        const confirm = screen.getByRole('button', { name: 'Cancelar reserva' });
        confirm.focus();

        // Act: both buttons are disabled while confirming, and the browser
        // takes the focus of a disabled button to the body (jsdom does not,
        // so the test does it); then the action fails
        confirm.blur();
        rerender(dialog(true));
        expect(confirm).toBeDisabled();
        expect(document.body).toHaveFocus();
        rerender(dialog(false));

        // Assert
        expect(screen.getByRole('button', { name: 'Conservar reserva' })).toHaveFocus();
    });
});
