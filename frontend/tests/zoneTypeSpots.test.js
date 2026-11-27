import { render, screen, within } from '@testing-library/react';
import ZoneTypeSpots from '../src/components/ZoneTypeSpots';

// HU-31 AC-08: the types of a zone, each one with its free spots now and its
// rate. The API sends only the types that take reservations, here in another
// order than the one of the screens.
const ZONE = {
    id: 'z1',
    vehicleTypes: [
        { vehicleType: 'truck', totalSlots: 4, availableSlots: 1, hourlyRate: 6000 },
        { vehicleType: 'motorcycle', totalSlots: 10, availableSlots: 5, hourlyRate: 1500 },
        { vehicleType: 'car', totalSlots: 20, availableSlots: 0, hourlyRate: 3000.5 },
    ],
};

const rows = () => within(screen.getByRole('list', { name: 'Tipos de vehículo' })).getAllByRole('listitem');

describe('The types of a zone with their free spots and rates (AC-08)', () => {
    test('shows every type: car, motorcycle and truck, in that order', () => {
        // Act
        render(<ZoneTypeSpots zone={ZONE} />);

        // Assert: a screen reader hears each one as a sentence. The rate is
        // in whole pesos, with the non-breaking space of formatCurrency
        expect(rows().map((row) => row.textContent)).toEqual([
            'Carro, 0 libres, $\u00a03.001/h por hora',
            'Moto, 5 libres, $\u00a01.500/h por hora',
            'Camión, 1 libre, $\u00a06.000/h por hora',
        ]);
    });

    test('"/h" is only seen, and "por hora" only heard', () => {
        // Act
        render(<ZoneTypeSpots zone={ZONE} />);

        // Assert
        const [car] = rows();
        expect(within(car).getByText('/h')).toHaveAttribute('aria-hidden', 'true');
        expect(within(car).getByText('por hora')).toHaveClass('sr-only');
        expect(within(car).getAllByText(',', { normalizer: (text) => text.trim() })).toHaveLength(2);
        within(car).getAllByText(',', { normalizer: (text) => text.trim() }).forEach((comma) => expect(comma).toHaveClass('sr-only'));
    });

    test('each type has its icon, hidden from screen readers', () => {
        // Act
        render(<ZoneTypeSpots zone={ZONE} />);

        // Assert
        rows().forEach((row) => {
            expect(row.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        });
    });

    test('a zone with only motorcycles shows only them', () => {
        // Act
        render(<ZoneTypeSpots zone={{ id: 'z2', vehicleTypes: [ZONE.vehicleTypes[1]] }} />);

        // Assert
        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toHaveTextContent('Moto');
    });

    test('the small size is for the cards of the home', () => {
        // Act
        render(<ZoneTypeSpots zone={ZONE} size="sm" className="mt-1.5" />);

        // Assert
        const list = screen.getByRole('list', { name: 'Tipos de vehículo' });
        expect(list).toHaveClass('text-caption');
        expect(list.parentElement).toHaveClass('@container', 'mt-1.5');
    });
});
