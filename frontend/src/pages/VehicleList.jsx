import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Car,
    Truck,
    Motorbike,
    Star,
    Pencil,
    Trash2,
    Plus,
    RefreshCw,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Info,
} from 'lucide-react';
import { getVehicles, setDefaultVehicle } from '../services/vehicleService';
import { translateError } from '../utils/errorMessages';

// AC-10: the list must be paginated when there are more than 9 vehicles.
const PAGE_SIZE = 9;

const VEHICLE_TYPE_ICONS = { car: Car, motorcycle: Motorbike, truck: Truck };
const VEHICLE_TYPE_LABELS = { car: 'Automóvil', motorcycle: 'Motocicleta', truck: 'Camión' };

function LicensePlate({ plate }) {
    return (
        <div className="flex w-[128px] shrink-0 flex-col items-center overflow-hidden rounded-md border-2 border-neutral-900 bg-neutral-200">
            <p className="mt-1 font-mono text-subtitle font-bold tracking-wider text-neutral-900">{plate}</p>
            <div className="flex w-full items-center justify-center gap-1 bg-neutral-900 py-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white">Colombia</span>
                <span className="flex h-2 w-3 flex-col overflow-hidden rounded-[1px]" aria-hidden="true">
                    <span className="h-1 bg-[#FCD116]" />
                    <span className="h-[2px] bg-[#003893]" />
                    <span className="h-[2px] bg-[#CE1126]" />
                </span>
            </div>
        </div>
    );
}

function VehicleCard({ vehicle, onSetDefault, settingDefaultId, onEdit, onDelete }) {
    const Icon = VEHICLE_TYPE_ICONS[vehicle.vehicleType] ?? Car;
    const typeLabel = VEHICLE_TYPE_LABELS[vehicle.vehicleType] ?? vehicle.vehicleType;
    const isSettingThis = settingDefaultId === vehicle.id;
    const vehicleDescription = `${vehicle.brand} ${vehicle.model}, placa ${vehicle.plate}`;

    return (
        <div
            className={`relative rounded-lg border-2 bg-white p-6 pt-8 ${vehicle.isDefault ? 'border-parkea-600' : 'border-neutral-200'
                }`}
        >
            <div className="absolute -top-3 left-4">
                {vehicle.isDefault ? (
                    <span className="flex items-center gap-1.5 rounded-full border border-parkea-600 bg-white px-3 py-1 text-label font-medium text-parkea-600">
                        <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" aria-hidden="true" />
                        Predeterminado
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => onSetDefault(vehicle.id)}
                        disabled={settingDefaultId !== null}
                        aria-label={`Marcar ${vehicleDescription} como vehículo predeterminado`}
                        className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1 text-label font-medium text-neutral-600 transition-colors hover:border-parkea-600 hover:text-parkea-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Star className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
                        {isSettingThis ? 'Marcando…' : 'Marcar como predeterminado'}
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-6">
                <LicensePlate plate={vehicle.plate} />

                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                    <Icon className="h-7 w-7" aria-hidden="true" />
                </span>

                <div className="grid grid-cols-[130px_140px_1fr] gap-x-8 gap-y-2">
                    <div className="col-start-1 row-start-1">
                        <p className="text-caption text-neutral-500">Marca</p>
                        <p className="text-body font-medium text-neutral-900">{vehicle.brand}</p>
                    </div>
                    <div className="col-start-2 row-start-1">
                        <p className="text-caption text-neutral-500">Modelo</p>
                        <p className="text-body font-medium text-neutral-900">{vehicle.model}</p>
                    </div>
                    <div className="col-start-1 row-start-2">
                        <p className="text-caption text-neutral-500">Color</p>
                        <p className="text-body font-medium text-neutral-900">{vehicle.color}</p>
                    </div>
                    <div className="col-start-2 row-start-2">
                        <p className="text-caption text-neutral-500">Tipo</p>
                        <p className="text-body font-medium text-neutral-900">{typeLabel}</p>
                    </div>
                    {vehicle.visualDescription && (
                        <div className="col-start-3 row-start-1 row-span-2">
                            <p className="text-caption text-neutral-500">Descripción visual</p>
                            <p className="text-body font-medium text-neutral-900">{vehicle.visualDescription}</p>
                        </div>
                    )}
                </div>

                <div className="ml-auto flex shrink-0 flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => onEdit(vehicle.id)}
                        aria-label={`Editar ${vehicleDescription}`}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-4 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                    >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Editar
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(vehicle.id)}
                        aria-label={`Eliminar ${vehicleDescription}`}
                        className="flex items-center gap-1.5 rounded-md border border-danger px-4 py-1.5 text-label text-danger transition-colors hover:bg-danger-soft"
                    >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function VehicleList() {
    const navigate = useNavigate();
    const location = useLocation();

    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [page, setPage] = useState(1);
    const [settingDefaultId, setSettingDefaultId] = useState(null);
    const [setDefaultError, setSetDefaultError] = useState('');

    // AC-07 (HU-10): flash message after a successful registration redirect
    // same pattern as Login.jsx's "Registro completado" (location.state, auto-dismiss).
    const [vehicleAdded, setVehicleAdded] = useState(Boolean(location.state?.vehicleAdded));

    useEffect(() => {
        if (!vehicleAdded) return;
        const timer = setTimeout(() => setVehicleAdded(false), 3000);
        return () => clearTimeout(timer);
    }, [vehicleAdded]);

    const fetchVehicles = useCallback(() => {
        getVehicles()
            .then(({ data }) => {
                setVehicles(data.vehicles);
                setError(false);
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchVehicles();
    }, [fetchVehicles]);

    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchVehicles();
    };

    const handleSetDefault = (id) => {
        setSettingDefaultId(id);
        setSetDefaultError('');
        setDefaultVehicle(id)
            .then(() => fetchVehicles())
            .catch((err) => {
                setSetDefaultError(translateError(err.response?.data?.code));
            })
            .finally(() => setSettingDefaultId(null));
    };

    const handleEdit = (id) => navigate(`/vehicles/${id}/edit`);

    const handleDelete = (id) => {
        console.log('TODO: HU-13 — open delete confirmation dialog for vehicle', id);
    };

    const totalPages = Math.max(1, Math.ceil(vehicles.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const paginatedVehicles = vehicles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-title font-display uppercase text-neutral-900">Mis vehículos</h1>
                    <p className="mt-1 text-body text-neutral-600">
                        Administra los vehículos que tienes registrados para tus reservas.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => navigate('/vehicles/new')}
                    className="flex items-center gap-2 rounded-md bg-parkea-600 px-4 py-2 text-label text-white transition-colors hover:bg-parkea-700"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar vehículo
                </button>
            </div>

            {vehicleAdded && (
                <p role="status" className="mt-4 rounded-md bg-parkea-50 px-3 py-2 text-center text-caption text-parkea-700">
                    Vehículo registrado correctamente.
                </p>
            )}

            {setDefaultError && (
                <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-body text-danger">
                    {setDefaultError}
                </p>
            )}

            <div className="mt-6">
                {loading && (
                    <p role="status" aria-live="polite" className="text-body text-neutral-600">
                        Cargando vehículos…
                    </p>
                )}

                {!loading && error && (
                    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger-soft bg-danger-soft p-5">
                        <p className="flex items-center gap-2 text-body text-danger">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            No pudimos cargar tus vehículos. Intenta de nuevo.
                        </p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-label text-danger transition-colors hover:bg-white"
                        >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Reintentar
                        </button>
                    </div>
                )}

                {!loading && !error && vehicles.length === 0 && (
                    <div className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-5">
                        <p className="text-body text-neutral-600">Aún no tienes vehículos registrados.</p>
                        <button
                            type="button"
                            onClick={() => navigate('/vehicles/new')}
                            className="flex items-center gap-2 rounded-md bg-parkea-600 px-4 py-2 text-label text-white transition-colors hover:bg-parkea-700"
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Agregar vehículo
                        </button>
                    </div>
                )}

                {!loading && !error && paginatedVehicles.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 gap-5">
                            {paginatedVehicles.map((vehicle) => (
                                <VehicleCard
                                    key={vehicle.id}
                                    vehicle={vehicle}
                                    onSetDefault={handleSetDefault}
                                    settingDefaultId={settingDefaultId}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <nav aria-label="Paginación de vehículos" className="mt-6 flex items-center justify-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    aria-label="Página anterior"
                                    className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:text-neutral-900"
                                >
                                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                    Anterior
                                </button>
                                <span className="text-label text-neutral-600" aria-live="polite">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    aria-label="Página siguiente"
                                    className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:text-neutral-900"
                                >
                                    Siguiente
                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </nav>
                        )}

                        <p className="mt-6 flex items-center justify-center gap-1.5 text-caption text-neutral-500">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            El vehículo predeterminado se seleccionará automáticamente al realizar una reserva.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}