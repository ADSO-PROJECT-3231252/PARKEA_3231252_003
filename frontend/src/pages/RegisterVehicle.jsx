import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, IdCard, Tag, Layers, Palette, Eye, ChevronDown } from 'lucide-react';
import { isNotEmpty, isValidPlate } from '../utils/validators';
import { createVehicle } from '../services/vehicleService';
import { translateError } from '../utils/errorMessages';

const VEHICLE_TYPE_OPTIONS = [
    { value: 'car', label: 'Automóvil' },
    { value: 'motorcycle', label: 'Motocicleta' },
    { value: 'truck', label: 'Camión' },
];

const PLATE_PLACEHOLDER = {
    car: 'Ejemplo: GHT421',
    truck: 'Ejemplo: GHT421',
    motorcycle: 'Ejemplo: GHT42D',
};

const REQUIRED_MESSAGE = 'Este campo es obligatorio.';

// Mirrors the DB column limits (brand/model varchar(50), color varchar(30),
// visual_description varchar(255)) — see vehiculo.routes.js on the backend.
const MAX_LENGTH = {
    brand: 50,
    model: 50,
    color: 30,
    visualDescription: 255,
};

function FieldRow({ icon: Icon, children }) {
    return (
        <div className="flex items-start gap-4">
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1">{children}</div>
        </div>
    );
}

export default function RegisterVehicle() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        vehicleType: '',
        plate: '',
        brand: '',
        model: '',
        color: '',
        visualDescription: '',
    });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'plate') {
            // AC-03: plates are alphanumeric, uppercase, no spaces — normalize as
            // the user types so what they see matches what gets validated/sent.
            setForm((prev) => ({ ...prev, plate: value.toUpperCase().replace(/\s/g, '') }));
        } else {
            setForm((prev) => ({ ...prev, [name]: value }));
        }
    };

    const handleTypeChange = (e) => {
        const vehicleType = e.target.value;
        setForm((prev) => ({ ...prev, vehicleType }));

        // A plate format error from a previously selected type shouldn't linger
        // if the new type actually accepts what's already typed.
        setErrors((prev) => {
            if (!prev.plate || !form.plate) return prev;
            const stillInvalid = !isValidPlate(form.plate, vehicleType);
            if (stillInvalid) return prev;
            // eslint-disable-next-line no-unused-vars
            const { plate, ...rest } = prev;
            return rest;
        });
    };

    const validate = () => {
        const newErrors = {};

        if (!isNotEmpty(form.vehicleType)) newErrors.vehicleType = REQUIRED_MESSAGE;

        if (!isNotEmpty(form.plate)) {
            newErrors.plate = REQUIRED_MESSAGE;
        } else if (form.vehicleType && !isValidPlate(form.plate, form.vehicleType)) {
            newErrors.plate = translateError('INVALID_PLATE_FORMAT');
        }

        if (!isNotEmpty(form.brand)) newErrors.brand = REQUIRED_MESSAGE;
        if (!isNotEmpty(form.model)) newErrors.model = REQUIRED_MESSAGE;
        if (!isNotEmpty(form.color)) newErrors.color = REQUIRED_MESSAGE;

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setServerError('');
        if (!validate()) return;

        setLoading(true);
        try {
            const payload = {
                plate: form.plate,
                vehicleType: form.vehicleType,
                brand: form.brand.trim(),
                model: form.model.trim(),
                color: form.color.trim(),
            };
            // AC-02: optional field, omit entirely rather than send an empty string.
            if (isNotEmpty(form.visualDescription)) {
                payload.visualDescription = form.visualDescription.trim();
            }

            await createVehicle(payload);
            // AC-07: success message + redirect, via the same flash-state pattern
            // Login.jsx uses for "Registro completado".
            navigate('/vehicles', { state: { vehicleAdded: true } });
        } catch (err) {
            const code = err.response?.data?.code;
            // AC-04: plate-already-registered must show inline on the plate field,
            // not as a generic banner.
            if (code === 'INVALID_PLATE_FORMAT' || code === 'PLATE_ALREADY_REGISTERED') {
                setErrors((prev) => ({ ...prev, plate: translateError(code) }));
            } else {
                setServerError(translateError(code));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => navigate('/vehicles'); // AC-06: explicit route, not navigate(-1)

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="text-title font-display uppercase text-neutral-900">Agregar vehículo</h1>
            <p className="mt-1 text-body text-neutral-600">
                Registra un nuevo vehículo para usarlo en tus reservas.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-6 w-full rounded-lg border border-neutral-200 bg-white p-8">
                {serverError && (
                    <p role="alert" className="mb-6 rounded-md bg-danger-soft px-3 py-2 text-center text-caption text-danger">
                        {serverError}
                    </p>
                )}

                <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
                    <FieldRow icon={Car}>
                        <label htmlFor="vehicleType" className="block text-label text-neutral-700">
                            Tipo de vehículo <span className="text-danger">*</span>
                        </label>
                        <div className="relative mt-1">
                            <select
                                id="vehicleType"
                                name="vehicleType"
                                value={form.vehicleType}
                                onChange={handleTypeChange}
                                aria-invalid={Boolean(errors.vehicleType)}
                                aria-describedby={errors.vehicleType ? 'vehicleType-error' : undefined}
                                className={`w-full appearance-none rounded-md border bg-white px-3 py-2.5 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.vehicleType ? 'border-danger' : 'border-neutral-200'
                                    }`}
                            >
                                <option value="" disabled>
                                    Selecciona el tipo de vehículo
                                </option>
                                {VEHICLE_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown
                                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
                                aria-hidden="true"
                            />
                        </div>
                        {errors.vehicleType ? (
                            <p id="vehicleType-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.vehicleType}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">
                                Elige el tipo de vehículo que deseas registrar.
                            </p>
                        )}
                    </FieldRow>

                    <FieldRow icon={IdCard}>
                        <label htmlFor="plate" className="block text-label text-neutral-700">
                            Placa <span className="text-danger">*</span>
                        </label>
                        <input
                            id="plate"
                            name="plate"
                            type="text"
                            value={form.plate}
                            onChange={handleChange}
                            placeholder={PLATE_PLACEHOLDER[form.vehicleType] || 'Ejemplo: GHT421'}
                            aria-invalid={Boolean(errors.plate)}
                            aria-describedby={errors.plate ? 'plate-error' : undefined}
                            className={`mt-1 w-full rounded-md border px-3 py-2.5 font-mono text-body text-neutral-900 placeholder:font-sans placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.plate ? 'border-danger' : 'border-neutral-200'
                                }`}
                        />
                        {errors.plate ? (
                            <p id="plate-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.plate}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">Ingresa la placa sin espacios.</p>
                        )}
                    </FieldRow>

                    <FieldRow icon={Tag}>
                        <label htmlFor="brand" className="block text-label text-neutral-700">
                            Marca <span className="text-danger">*</span>
                        </label>
                        <input
                            id="brand"
                            name="brand"
                            type="text"
                            maxLength={MAX_LENGTH.brand}
                            value={form.brand}
                            onChange={handleChange}
                            placeholder="Ejemplo: Mazda"
                            aria-invalid={Boolean(errors.brand)}
                            aria-describedby={errors.brand ? 'brand-error' : undefined}
                            className={`mt-1 w-full rounded-md border px-3 py-2.5 text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.brand ? 'border-danger' : 'border-neutral-200'
                                }`}
                        />
                        {errors.brand && (
                            <p id="brand-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.brand}
                            </p>
                        )}
                    </FieldRow>

                    <FieldRow icon={Layers}>
                        <label htmlFor="model" className="block text-label text-neutral-700">
                            Modelo <span className="text-danger">*</span>
                        </label>
                        <input
                            id="model"
                            name="model"
                            type="text"
                            maxLength={MAX_LENGTH.model}
                            value={form.model}
                            onChange={handleChange}
                            placeholder="Ejemplo: CX-30 2.0"
                            aria-invalid={Boolean(errors.model)}
                            aria-describedby={errors.model ? 'model-error' : undefined}
                            className={`mt-1 w-full rounded-md border px-3 py-2.5 text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.model ? 'border-danger' : 'border-neutral-200'
                                }`}
                        />
                        {errors.model && (
                            <p id="model-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.model}
                            </p>
                        )}
                    </FieldRow>

                    <FieldRow icon={Eye}>
                        <label htmlFor="visualDescription" className="block text-label text-neutral-700">
                            Descripción visual <span className="text-neutral-500">(opcional)</span>
                        </label>
                        <textarea
                            id="visualDescription"
                            name="visualDescription"
                            rows={3}
                            maxLength={MAX_LENGTH.visualDescription}
                            value={form.visualDescription}
                            onChange={handleChange}
                            placeholder="Ejemplo: Rayón en la puerta delantera derecha, calcomanía en el vidrio trasero."
                            className="mt-1 w-full resize-none rounded-md border border-neutral-200 px-3 py-2.5 text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                        />
                        <p className="mt-1 text-caption text-neutral-500">
                            Información adicional para identificar tu vehículo fácilmente.
                        </p>
                    </FieldRow>

                    <FieldRow icon={Palette}>
                        <label htmlFor="color" className="block text-label text-neutral-700">
                            Color <span className="text-danger">*</span>
                        </label>
                        <input
                            id="color"
                            name="color"
                            type="text"
                            maxLength={MAX_LENGTH.color}
                            value={form.color}
                            onChange={handleChange}
                            placeholder="Ejemplo: Gris Platino"
                            aria-invalid={Boolean(errors.color)}
                            aria-describedby={errors.color ? 'color-error' : undefined}
                            className={`mt-1 w-full rounded-md border px-3 py-2.5 text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.color ? 'border-danger' : 'border-neutral-200'
                                }`}
                        />
                        {errors.color ? (
                            <p id="color-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.color}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">
                                Los campos rellenados con <span className="text-danger">*</span> son obligatorios
                            </p>
                        )}
                    </FieldRow>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-neutral-200 pt-6">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="rounded-md border border-neutral-200 px-5 py-2 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center gap-2 rounded-md bg-parkea-600 px-5 py-2 text-label text-white transition-colors hover:bg-parkea-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Car className="h-4 w-4" aria-hidden="true" />
                        {loading ? 'Registrando…' : 'Registrar vehículo'}
                    </button>
                </div>
            </form>
        </div>
    );
}