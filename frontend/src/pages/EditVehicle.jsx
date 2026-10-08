import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Car, IdCard, Tag, Layers, Palette, Eye, ChevronDown, AlertCircle, RefreshCw } from 'lucide-react';
import { isNotEmpty, isValidPlate } from '../utils/validators';
import { getVehicle, updateVehicle } from '../services/vehicleService';
import { translateError } from '../utils/errorMessages';
const VEHICLE_TYPE_OPTIONS = [
    { value: 'car', label: 'Automóvil' },
    { value: 'motorcycle', label: 'Motocicleta' },
    { value: 'truck', label: 'Camión' },
];
const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
// Mirrors the DB column limits (brand/model varchar(50), color varchar(30),
// visual_description varchar(255)) — see vehiculo.routes.js on the backend.
// Same constant as RegisterVehicle.jsx; duplicated on purpose for now.
const MAX_LENGTH = {
    brand: 50,
    model: 50,
    color: 30,
    visualDescription: 255,
};
function FieldRow({ icon: Icon, children }) {
    return (
        <div className="flex items-start gap-4">
            <span
                className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center
rounded-full bg-parkea-50 text-parkea-600`}
            >
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1">{children}</div>
        </div>
    );
}
export default function EditVehicle() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [plate, setPlate] = useState('');
    const [form, setForm] = useState({
        vehicleType: '',
        brand: '',
        model: '',
        color: '',
        visualDescription: '',
    });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null); // null | 'not_found' | 'generic'
    const [saving, setSaving] = useState(false);
    const fetchVehicle = useCallback(() => {
        getVehicle(id)
            .then(({ data }) => {
                const vehicle = data.vehicle;
                setPlate(vehicle.plate);
                setForm({
                    vehicleType: vehicle.vehicleType,
                    brand: vehicle.brand ?? '',
                    model: vehicle.model ?? '',
                    color: vehicle.color ?? '',
                    visualDescription: vehicle.visualDescription ?? '',
                });
                setFetchError(null);
            })
            .catch((err) => {
                const code = err.response?.data?.code;
                setFetchError(code === 'VEHICLE_NOT_FOUND' ? 'not_found' : 'generic');
            })
            .finally(() => setLoading(false));
    }, [id]);
    useEffect(() => {
        fetchVehicle();
    }, [fetchVehicle]);
    const handleRetry = () => {
        setLoading(true);
        setFetchError(null);
        fetchVehicle();
    };
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };
    const handleTypeChange = (e) => {
        const vehicleType = e.target.value;
        setForm((prev) => ({ ...prev, vehicleType }));
        // AC-05: the plate itself can't change here, so if the new type no longer
        // matches it, warn immediately instead of waiting for the server round trip.
        setErrors((prev) => {
            const stillInvalid = plate && !isValidPlate(plate, vehicleType);
            if (stillInvalid) {
                return { ...prev, vehicleType: translateError('INVALID_PLATE_FORMAT') };
            }
            // eslint-disable-next-line no-unused-vars
            const { vehicleType: _discard, ...rest } = prev;
            return rest;
        });
    };
    const validate = () => {
        const newErrors = {};
        if (!isNotEmpty(form.vehicleType)) {
            newErrors.vehicleType = REQUIRED_MESSAGE;
        } else if (plate && !isValidPlate(plate, form.vehicleType)) {
            newErrors.vehicleType = translateError('INVALID_PLATE_FORMAT');
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
        setSaving(true);
        try {
            const payload = {
                vehicleType: form.vehicleType,
                brand: form.brand.trim(),
                model: form.model.trim(),
                color: form.color.trim(),
                // Unlike Register, this is ALWAYS sent, even when empty: Sequelize
                // ignores "undefined" fields on an update() and leaves the old value
                // untouched, so omitting it when the user clears it would mean the
                // old description could never be deleted.
                visualDescription: form.visualDescription.trim(),
            };
            await updateVehicle(id, payload);
            // AC-08: success message + return to list with updated data.
            navigate('/vehicles', { state: { vehicleUpdated: true } });
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'INVALID_PLATE_FORMAT') {
                setErrors((prev) => ({ ...prev, vehicleType: translateError(code) }));
            } else {
                setServerError(translateError(code));
            }
        } finally {
            setSaving(false);
        }
    };
    // AC-06: explicit route back to the list, not navigate(-1).
    const handleCancel = () => navigate('/vehicles');
    if (loading) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <p role="status" aria-live="polite" className="text-body text-neutral-600">
                    Cargando datos del vehículo…
                </p>
            </div>
        );
    }
    if (fetchError) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <div
                    role="alert"
                    className={`flex flex-col items-start gap-3 rounded-lg border
border-danger-soft bg-danger-soft p-5`}
                >
                    <p className="flex items-center gap-2 text-body text-danger">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {fetchError === 'not_found'
                            ? 'No encontramos este vehículo.'
                            : 'No pudimos cargar los datos del vehículo. ' + 'Intenta de nuevo.'}
                    </p>
                    {fetchError === 'not_found' ? (
                        <button
                            type="button"
                            onClick={() => navigate('/vehicles')}
                            className={`flex items-center gap-1.5 rounded-md border
border-danger px-3 py-1.5 text-label text-danger
transition-colors hover:bg-white`}
                        >
                            Volver a mis vehículos
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleRetry}
                            className={`flex items-center gap-1.5 rounded-md border
border-danger px-3 py-1.5 text-label text-danger
transition-colors hover:bg-white`}
                        >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Reintentar
                        </button>
                    )}
                </div>
            </div>
        );
    }
    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="text-title font-display uppercase text-neutral-900">Editar vehículo</h1>
            <p className="mt-1 text-body text-neutral-600">
                Actualiza la información de tu vehículo registrado.
            </p>
            <form
                onSubmit={handleSubmit}
                noValidate
                className="mt-6 w-full rounded-lg border border-neutral-200 bg-white p-8"
            >
                {serverError && (
                    <p
                        role="alert"
                        className={`mb-6 rounded-md bg-danger-soft px-3 py-2 text-center
text-caption text-danger`}
                    >
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
                                className={`w-full appearance-none rounded-md border bg-white
px-3 py-2.5 text-body text-neutral-900 focus:outline-none
focus:ring-2 focus:ring-parkea-600 ${errors.vehicleType ? 'border-danger' : 'border-neutral-200'}`}
                            >
                                {VEHICLE_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown
                                className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4
-translate-y-1/2 text-neutral-500`}
                                aria-hidden="true"
                            />
                        </div>
                        {errors.vehicleType ? (
                            <p id="vehicleType-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.vehicleType}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">
                                Elige el tipo que corresponde a tu vehículo.
                            </p>
                        )}
                    </FieldRow>
                    <FieldRow icon={IdCard}>
                        <label htmlFor="plate" className="block text-label text-neutral-700">
                            Placa
                        </label>
                        <input
                            id="plate"
                            name="plate"
                            type="text"
                            value={plate}
                            disabled
                            aria-describedby="plate-note"
                            className={`mt-1 w-full cursor-not-allowed rounded-md border
border-neutral-200 bg-neutral-100 px-3 py-2.5 font-mono
text-body text-neutral-500`}
                        />
                        <p id="plate-note" className="mt-1 text-caption text-neutral-500">
                            La placa no se puede editar. Para cambiarla, elimina este vehículo y regístralo de
                            nuevo.
                        </p>
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
                            className={`mt-1 w-full rounded-md border px-3 py-2.5 text-body
text-neutral-900 placeholder:text-neutral-400 focus:outline-none
focus:ring-2 focus:ring-parkea-600 ${errors.brand ? 'border-danger' : 'border-neutral-200'}`}
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
                            className={`mt-1 w-full rounded-md border px-3 py-2.5 text-body
text-neutral-900 placeholder:text-neutral-400 focus:outline-none
focus:ring-2 focus:ring-parkea-600 ${errors.model ? 'border-danger' : 'border-neutral-200'}`}
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
                            placeholder={
                                'Ejemplo: Rayón en la puerta delantera derecha, ' +
                                'calcomanía en el vidrio trasero.'
                            }
                            className={`mt-1 w-full resize-none rounded-md border
border-neutral-200 px-3 py-2.5 text-body text-neutral-900
placeholder:text-neutral-400 focus:outline-none focus:ring-2
focus:ring-parkea-600`}
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
                            className={`mt-1 w-full rounded-md border px-3 py-2.5 text-body
text-neutral-900 placeholder:text-neutral-400 focus:outline-none
focus:ring-2 focus:ring-parkea-600 ${errors.color ? 'border-danger' : 'border-neutral-200'}`}
                        />
                        {errors.color ? (
                            <p id="color-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.color}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">
                                Los campos rellenados con <span className="text-danger">*</span> son
                                obligatorios
                            </p>
                        )}
                    </FieldRow>
                </div>
                <div
                    className={`mt-8 flex items-center justify-between border-t
border-neutral-200 pt-6`}
                >
                    <button
                        type="button"
                        onClick={handleCancel}
                        className={`rounded-md border border-neutral-200 px-5 py-2 text-label
text-neutral-900 transition-colors hover:border-parkea-600
hover:text-parkea-600`}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className={`flex items-center gap-2 rounded-md bg-parkea-600 px-5 py-2
text-label text-white transition-colors hover:bg-parkea-700
disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        <Car className="h-4 w-4" aria-hidden="true" />
                        {saving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </form>
        </div>
    );
}
