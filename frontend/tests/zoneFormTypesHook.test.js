import { act, renderHook } from '@testing-library/react';
import useZoneForm from '../src/hooks/useZoneForm';
import { EMPTY_ZONE_FORM } from '../src/utils/zoneForm';

// HU-31 AC-01: checking a vehicle type and typing its spots and rate, in the
// state of the zone form (useZoneForm)
const types = (result) => result.current.form.vehicleTypes;

describe('The vehicle types in the state of the zone form (HU-31)', () => {
    test('none is checked in a new zone', () => {
        const { result } = renderHook(() => useZoneForm(EMPTY_ZONE_FORM));
        expect(types(result)).toEqual({
            car: { checked: false, totalSlots: '', hourlyRate: '' },
            motorcycle: { checked: false, totalSlots: '', hourlyRate: '' },
            truck: { checked: false, totalSlots: '', hourlyRate: '' },
        });
    });

    test('a type checked after another starts with the rate typed for it', () => {
        // Arrange
        const { result } = renderHook(() => useZoneForm(EMPTY_ZONE_FORM));
        act(() => result.current.setTypeChecked('car', true));
        act(() => result.current.setTypeValue('car', 'hourlyRate', '2000'));

        // Act
        act(() => result.current.setTypeChecked('truck', true));

        // Assert
        expect(types(result).truck).toEqual({ checked: true, totalSlots: '', hourlyRate: '2000' });
    });

    test('the first type checked starts without a rate', () => {
        const { result } = renderHook(() => useZoneForm(EMPTY_ZONE_FORM));
        act(() => result.current.setTypeChecked('motorcycle', true));
        expect(types(result).motorcycle.hourlyRate).toBe('');
    });

    test('a rate typed in a type that is unchecked is not used', () => {
        // Arrange: motorcycles typed and then unchecked
        const { result } = renderHook(() => useZoneForm(EMPTY_ZONE_FORM));
        act(() => result.current.setTypeChecked('motorcycle', true));
        act(() => result.current.setTypeValue('motorcycle', 'hourlyRate', '900'));
        act(() => result.current.setTypeChecked('motorcycle', false));

        // Act
        act(() => result.current.setTypeChecked('car', true));

        // Assert
        expect(types(result).car.hourlyRate).toBe('');
    });

    test('unchecking keeps the spots and the rate, and checking again brings them back', () => {
        // Arrange
        const { result } = renderHook(() => useZoneForm(EMPTY_ZONE_FORM));
        act(() => result.current.setTypeChecked('car', true));
        act(() => result.current.setTypeValue('car', 'totalSlots', '20'));
        act(() => result.current.setTypeValue('car', 'hourlyRate', '2500'));
        act(() => result.current.setTypeChecked('truck', true));
        act(() => result.current.setTypeValue('truck', 'hourlyRate', '5000'));

        // Act
        act(() => result.current.setTypeChecked('car', false));
        act(() => result.current.setTypeChecked('car', true));

        // Assert: its own rate, not the one of the trucks
        expect(types(result).car).toEqual({ checked: true, totalSlots: '20', hourlyRate: '2500' });
    });

    test('checking a type or typing in it clears its errors, and its spots the error of the section', () => {
        // Arrange
        const { result } = renderHook(() => useZoneForm(EMPTY_ZONE_FORM));
        act(() => result.current.showErrors({
            vehicleTypes: 'x',
            'car.totalSlots': 'x',
            'car.hourlyRate': 'x',
            'truck.hourlyRate': 'x',
        }));

        // Act + Assert
        act(() => result.current.setTypeValue('car', 'hourlyRate', '1'));
        expect(Object.keys(result.current.errors)).toEqual(['vehicleTypes', 'car.totalSlots', 'truck.hourlyRate']);
        act(() => result.current.setTypeValue('car', 'totalSlots', '1'));
        expect(Object.keys(result.current.errors)).toEqual(['truck.hourlyRate']);
        act(() => result.current.setTypeChecked('truck', false));
        expect(result.current.errors).toEqual({});
    });
});
