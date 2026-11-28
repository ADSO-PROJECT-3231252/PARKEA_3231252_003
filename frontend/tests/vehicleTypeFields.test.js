import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useZoneForm from '../src/hooks/useZoneForm';
import VehicleTypeFields from '../src/components/VehicleTypeFields';
import { EMPTY_ZONE_FORM, emptyVehicleTypes } from '../src/utils/zoneForm';

// HU-31 AC-01 and AC-17: the "Tipos de vehículo" section of the zone form,
// alone, with the same state the screens use
function Section({ initialForm = EMPTY_ZONE_FORM, errors, ...props }) {
    const zoneForm = useZoneForm(initialForm);
    return (
        <>
            <VehicleTypeFields zoneForm={zoneForm} {...props} />
            <button type="button" onClick={() => zoneForm.showErrors(errors)}>Mostrar errores</button>
        </>
    );
}

const withCars = () => ({ ...EMPTY_ZONE_FORM, vehicleTypes: { ...emptyVehicleTypes(), car: { checked: true, totalSlots: '20', hourlyRate: '2000' } } });

describe('The section of the vehicle types (HU-31)', () => {
    test('is a group with its legend and a hint, with one checkbox per type, each with its name', () => {
        // Act
        render(<Section />);

        // Assert
        const group = screen.getByRole('group', { name: /Tipos de vehículo/ });
        expect(group).toHaveAccessibleDescription('Marca los vehículos que recibe la zona, con sus cupos y su tarifa por hora.');
        expect(screen.getAllByRole('checkbox').map((box) => box.labels[0].textContent)).toEqual(['Carro', 'Moto', 'Camión']);
    });

    test('a checked type has its spots and its rate, named with the type for screen readers', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<Section />);

        // Act
        await user.click(screen.getByRole('checkbox', { name: 'Camión' }));

        // Assert
        expect(screen.getByRole('textbox', { name: 'Cupos de camiones' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Tarifa por hora de camiones (COP)' })).toBeInTheDocument();
    });

    test('the spots and the rate take digits only', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<Section initialForm={withCars()} />);
        const slots = screen.getByLabelText(/^Cupos de carros/);
        const rate = screen.getByLabelText(/^Tarifa por hora de carros/);

        // Act
        await user.clear(slots);
        await user.type(slots, '1a5');
        await user.clear(rate);
        await user.type(rate, '2.500');

        // Assert
        expect(slots).toHaveValue('15');
        expect(rate).toHaveValue('2500');
    });

    test('the total counts the checked types, said as 1 cupo or several', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<Section initialForm={withCars()} />);
        expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: 20 cupos');

        // Act
        await user.clear(screen.getByLabelText(/^Cupos de carros/));
        await user.type(screen.getByLabelText(/^Cupos de carros/), '1');

        // Assert
        expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: 1 cupo');
    });

    test('the error of the section replaces its hint, and the error of a field goes under it', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<Section initialForm={withCars()} errors={{ vehicleTypes: 'Marca al menos un tipo de vehículo.', 'car.hourlyRate': 'Este campo es obligatorio.' }} />);

        // Act
        await user.click(screen.getByRole('button', { name: 'Mostrar errores' }));

        // Assert
        expect(screen.getByRole('group', { name: /Tipos de vehículo/ })).toHaveAccessibleDescription('Marca al menos un tipo de vehículo.');
        const rate = screen.getByLabelText(/^Tarifa por hora de carros/);
        expect(rate).toHaveAccessibleDescription('Este campo es obligatorio.');
        expect(rate).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByLabelText(/^Cupos de carros/)).toHaveAttribute('aria-invalid', 'false');
    });

    test('the hints of each type come from the screen, and an unchecked type shows its own', () => {
        // Act
        render(
            <Section
                initialForm={withCars()}
                hints={{ car: { totalSlots: 'Mínimo 4.', hourlyRate: 'Tarifa.' }, truck: { off: 'No recibe camiones.' } }}
            />,
        );

        // Assert
        expect(screen.getByLabelText(/^Cupos de carros/)).toHaveAccessibleDescription('Mínimo 4.');
        expect(screen.getByLabelText(/^Tarifa por hora de carros/)).toHaveAccessibleDescription('Tarifa.');
        expect(screen.getByText('No recibe camiones.')).toBeInTheDocument();
    });

    test('without keepOneChecked, the last type can be unchecked (a new zone)', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<Section initialForm={withCars()} />);

        // Act
        await user.click(screen.getByRole('checkbox', { name: 'Carro' }));

        // Assert
        expect(screen.getByRole('checkbox', { name: 'Carro' })).not.toBeChecked();
    });

    test('with keepOneChecked, the last type says why it cannot be unchecked, and it stays checked', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<Section initialForm={withCars()} keepOneChecked />);
        const car = screen.getByRole('checkbox', { name: 'Carro' });

        // Act
        await user.click(car);
        await user.keyboard(' ');

        // Assert
        expect(car).toBeChecked();
        expect(car).toHaveAttribute('aria-disabled', 'true');
        expect(car).toHaveAccessibleDescription('Es el único tipo que recibe la zona. Para cerrarla, desactiva la zona.');
        expect(screen.getByRole('checkbox', { name: 'Moto' })).not.toHaveAttribute('aria-disabled');
    });
});
