import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useZoneForm from '../src/hooks/useZoneForm';
import ZoneScheduleFields from '../src/components/ZoneScheduleFields';
import { EMPTY_ZONE_FORM, validateZoneForm, buildZonePayload, zoneToForm } from '../src/utils/zoneForm';

// HU-29: the "Horario de atención" part of the zone form. The rest of the
// form is tested in zoneForm.test.js; here only its hours are checked, with
// the same hook and the same validation the screens use.
function ScheduleForm({ initialForm = EMPTY_ZONE_FORM, onSave = () => {}, hint }) {
    const zoneForm = useZoneForm(initialForm);
    const handleSubmit = (e) => {
        e.preventDefault();
        // Only the errors of the hours: the other fields are not on this form
        const errors = Object.fromEntries(
            Object.entries(validateZoneForm(zoneForm.form)).filter(([key]) => key === 'open24h' || key === 'schedule' || key.startsWith('day')),
        );
        if (Object.keys(errors).length > 0) {
            zoneForm.showErrors(errors);
            return;
        }
        onSave(buildZonePayload({ ...zoneForm.form, name: '', address: '', latitude: '0', longitude: '0' }));
    };
    return (
        <form onSubmit={handleSubmit} noValidate>
            <ZoneScheduleFields zoneForm={zoneForm} hint={hint} />
            <button type="submit">Guardar</button>
        </form>
    );
}

const setTime = (input, value) => fireEvent.change(input, { target: { value } });

describe('Choosing the hours of a zone (HU-29, AC-01)', () => {
    test('neither option is chosen by default, and the zone cannot be saved until one is', async () => {
        // Arrange
        const onSave = jest.fn();
        const user = userEvent.setup();
        render(<ScheduleForm onSave={onSave} />);
        expect(screen.getByRole('radio', { name: /Abierta 24 horas/ })).not.toBeChecked();
        expect(screen.getByRole('radio', { name: /Horario personalizado/ })).not.toBeChecked();

        // Act
        await user.click(screen.getByRole('button', { name: 'Guardar' }));

        // Assert
        expect(screen.getByRole('alert')).toHaveTextContent('Elige si la zona abre las 24 horas o tiene un horario personalizado.');
        expect(screen.getByRole('radio', { name: /Abierta 24 horas/ })).toHaveFocus();
        expect(onSave).not.toHaveBeenCalled();
    });

    test('"Abierta 24 horas" saves without days', async () => {
        // Arrange
        const onSave = jest.fn();
        const user = userEvent.setup();
        render(<ScheduleForm onSave={onSave} />);

        // Act
        await user.click(screen.getByRole('radio', { name: /Abierta 24 horas/ }));
        await user.click(screen.getByRole('button', { name: 'Guardar' }));

        // Assert
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ open24h: true }));
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('schedule');
    });

    test('editing shows the current hours', () => {
        // Act
        render(<ScheduleForm initialForm={zoneToForm({ open24h: false, schedule: [{ day: 3, opensAt: '07:00', closesAt: '19:00' }] })} />);

        // Assert
        expect(screen.getByRole('radio', { name: /Horario personalizado/ })).toBeChecked();
        expect(screen.getByLabelText('Abre el miércoles')).toHaveValue('07:00');
        expect(screen.getByLabelText('¿Abre el lunes?')).toHaveValue('closed');
    });
});

describe('The custom schedule (HU-29, AC-02)', () => {
    async function chooseCustom() {
        const onSave = jest.fn();
        const user = userEvent.setup();
        render(<ScheduleForm onSave={onSave} />);
        await user.click(screen.getByRole('radio', { name: /Horario personalizado/ }));
        return { onSave, user };
    }

    test('shows one row per day, Monday to Sunday', async () => {
        // Act
        await chooseCustom();

        // Assert
        const rows = within(screen.getByRole('list')).getAllByRole('listitem');
        expect(rows).toHaveLength(7);
        expect(rows[0]).toHaveTextContent(/^Lunes/);
        expect(rows[6]).toHaveTextContent(/^Domingo/);
    });

    test('"Aplicar a todos" copies the hours of one day to every day', async () => {
        // Arrange
        const { user } = await chooseCustom();
        setTime(screen.getByLabelText('Abre el lunes'), '06:00');
        setTime(screen.getByLabelText('Cierra el lunes'), '20:00');

        // Act
        await user.click(screen.getByRole('button', { name: 'Aplicar a todos los días el horario del lunes' }));

        // Assert
        expect(screen.getByLabelText('Abre el domingo')).toHaveValue('06:00');
        expect(screen.getByLabelText('Cierra el jueves')).toHaveValue('20:00');
        expect(screen.getByRole('status')).toHaveTextContent('Se aplicó el horario del lunes');
    });

    test('"Aplicar a todos" waits until the day has valid hours', async () => {
        // Arrange
        await chooseCustom();
        // Act
        setTime(screen.getByLabelText('Abre el lunes'), '06:00');
        // Assert
        expect(screen.getByRole('button', { name: 'Aplicar a todos los días el horario del lunes' })).toBeDisabled();
    });

    test('a closed day hides its times, and only the open days are saved', async () => {
        // Arrange
        const { onSave, user } = await chooseCustom();
        setTime(screen.getByLabelText('Abre el lunes'), '06:00');
        setTime(screen.getByLabelText('Cierra el lunes'), '20:00');
        await user.click(screen.getByRole('button', { name: 'Aplicar a todos los días el horario del lunes' }));

        // Act
        await user.selectOptions(screen.getByLabelText('¿Abre el domingo?'), 'closed');
        await user.click(screen.getByRole('button', { name: 'Guardar' }));

        // Assert
        expect(screen.queryByLabelText('Abre el domingo')).not.toBeInTheDocument();
        expect(onSave.mock.calls[0][0].schedule.map((s) => s.day)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('an open day without times shows the error next to it and gets the focus', async () => {
        // Arrange
        const { onSave, user } = await chooseCustom();

        // Act
        await user.click(screen.getByRole('button', { name: 'Guardar' }));

        // Assert
        expect(screen.getByLabelText('Abre el lunes')).toHaveFocus();
        expect(screen.getByLabelText('Abre el lunes')).toHaveAccessibleDescription('Escribe la hora de apertura y la de cierre.');
        expect(onSave).not.toHaveBeenCalled();
    });

    test('less than 30 minutes open is rejected on that day', async () => {
        // Arrange
        const { user } = await chooseCustom();
        for (const day of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']) {
            await user.selectOptions(screen.getByLabelText(`¿Abre el ${day}?`), 'closed');
        }
        await user.selectOptions(screen.getByLabelText('¿Abre el martes?'), 'open');
        setTime(screen.getByLabelText('Abre el martes'), '22:00');
        setTime(screen.getByLabelText('Cierra el martes'), '02:00');

        // Act
        await user.click(screen.getByRole('button', { name: 'Guardar' }));

        // Assert
        expect(screen.getByLabelText('Abre el martes')).toHaveAccessibleDescription(/al menos 30 minutos antes del cierre/);
    });

    test('every day closed asks for at least one open day', async () => {
        // Arrange
        const { user } = await chooseCustom();
        for (const day of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']) {
            await user.selectOptions(screen.getByLabelText(`¿Abre el ${day}?`), 'closed');
        }

        // Act
        await user.click(screen.getByRole('button', { name: 'Guardar' }));

        // Assert
        expect(screen.getByRole('alert')).toHaveTextContent('Marca al menos un día como abierto.');
    });

    test('the edit screen explains that existing reservations keep their times (AC-07)', () => {
        // Act
        render(<ScheduleForm initialForm={zoneToForm({ open24h: true, schedule: [] })} hint="Las reservas que ya existen no cambian." />);

        // Assert
        expect(screen.getByRole('radio', { name: /Abierta 24 horas/ })).toHaveAccessibleDescription('Las reservas que ya existen no cambian.');
    });
});
