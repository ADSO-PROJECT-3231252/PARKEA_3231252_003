import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { X, Save, Power, PowerOff, AlertCircle, RefreshCw, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { getZone, getAllZones, updateZone, toggleZone } from '../services/zoneService';
import { translateError } from '../utils/errorMessages';
import { formatCurrency } from '../utils/format';
import { getZoneToggleDialog, getZoneToggleSuccess } from '../utils/zones';
import { VEHICLE_TYPES, vehicleTypePlural } from '../utils/vehicleTypes';
import { ZONE_LIMITS, zoneToForm, validateZoneForm, buildZonePayload } from '../utils/zoneForm';
import useZoneForm from '../hooks/useZoneForm';
import ZoneFormFields from '../components/ZoneFormFields';
import ZoneStatusBadge from '../components/ZoneStatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';

const PAGE_CLASS = 'mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6';

function PageTitle({ zone }) {
    return (
        <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-title font-display uppercase text-neutral-900">Editar zona</h1>
                {zone && <ZoneStatusBadge isActive={zone.isActive} />}
            </div>
            <p className="mt-1 text-body text-neutral-600">
                Actualiza la información de la zona de parqueo. Los campos marcados con{' '}
                <span className="text-danger" aria-hidden="true">*</span>
                <span className="sr-only">asterisco</span> son obligatorios.
            </p>
        </>
    );
}

// HU-31: the vehicle types of the zone as the admin list (/zones/all) sends
// them: the ones turned off too, and for each one the spots that hold a
// reservation from now on (spotsInUse, the least it can have, AC-04) and the
// reservations that hold them (openReservations, AC-05). null when unknown.
const adminTypesOf = (listed) => (Array.isArray(listed?.vehicleTypes) ? listed.vehicleTypes : null);

// Loads the zone and, apart, its types as the administrator sees them and how
// many reservations it has. Those only come in the admin list (/zones/all),
// so if that request fails the form still opens with the types the zone
// takes: the backend checks the spots in use anyway (AC-03).
export default function EditZone() {
    const { id } = useParams();
    const [zone, setZone] = useState(null);
    const [adminTypes, setAdminTypes] = useState(null);
    const [activeReservations, setActiveReservations] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null); // null | 'not_found' | 'generic'

    const fetchZone = useCallback(() => {
        Promise.allSettled([getZone(id), getAllZones()])
            .then(([one, all]) => {
                if (one.status === 'rejected') {
                    const code = one.reason.response?.data?.code;
                    setFetchError(code === 'ZONE_NOT_FOUND' ? 'not_found' : 'generic');
                    return;
                }
                setZone(one.value.data.zone);
                const listed = all.status === 'fulfilled' ? all.value.data.zones.find((z) => z.id === id) : null;
                setAdminTypes(adminTypesOf(listed));
                setActiveReservations(listed ? Number(listed.activeReservations) || 0 : null);
                setFetchError(null);
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        fetchZone();
    }, [fetchZone]);

    const handleRetry = () => {
        setLoading(true);
        setFetchError(null);
        fetchZone();
    };

    if (loading) {
        return (
            <div className={PAGE_CLASS}>
                <title>Editar zona | PARKEA</title>
                <PageTitle />
                <p role="status" aria-live="polite" className="mt-6 rounded-lg border border-neutral-200 bg-white p-6 text-body text-neutral-600">
                    Cargando datos de la zona…
                </p>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className={PAGE_CLASS}>
                <title>Editar zona | PARKEA</title>
                <PageTitle />
                <div role="alert" className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-6">
                    <p className="flex items-center gap-2 text-body text-danger">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {fetchError === 'not_found'
                            ? 'No encontramos esta zona. Puede que el enlace esté incompleto.'
                            : 'No pudimos cargar los datos de la zona. Intenta de nuevo.'}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {fetchError === 'generic' && (
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-label text-danger transition-colors hover:bg-danger-soft"
                            >
                                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                Reintentar
                            </button>
                        )}
                        <Link
                            to="/admin/zones"
                            className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Volver a zonas
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return <EditZoneForm initialZone={zone} adminTypes={adminTypes} activeReservations={activeReservations} />;
}

// HU-31 AC-04 / AC-05: { car: 3 } and { car: 5 } from the admin list
const countsOf = (adminTypes, name) =>
    Object.fromEntries((adminTypes ?? []).filter((t) => Number.isInteger(t[name])).map((t) => [t.vehicleType, t[name]]));

function EditZoneForm({ initialZone, adminTypes, activeReservations }) {
    const navigate = useNavigate();
    // The zone as saved: the form may hold changes not saved yet
    const [zone, setZone] = useState(initialZone);
    const [original] = useState(() => zoneToForm(initialZone, adminTypes ?? initialZone.vehicleTypes));
    const [spotsInUse, setSpotsInUse] = useState(() => countsOf(adminTypes, 'spotsInUse'));
    const zoneForm = useZoneForm(original);
    const { form, setServerError, showErrors, showApiError } = zoneForm;
    const [saving, setSaving] = useState(false);

    // AC-07: activate or deactivate, with the HU-19 confirmation
    const [dialogOpen, setDialogOpen] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [toggleError, setToggleError] = useState('');
    const [toggleMessage, setToggleMessage] = useState('');

    // AC-05 (HU-21): a new rate only applies to reservations made from now on
    const rateChanged = VEHICLE_TYPES.some((type) => {
        const before = original.vehicleTypes[type];
        const now = form.vehicleTypes[type];
        return before.checked && now.checked && now.hourlyRate !== '' && Number(now.hourlyRate) !== Number(before.hourlyRate);
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving || toggling) return;
        setServerError('');

        // AC-02 / AC-03: the HU-20 rules, and no type below its spots in use
        const newErrors = validateZoneForm(form, { spotsInUse });
        if (Object.keys(newErrors).length > 0) {
            showErrors(newErrors);
            return;
        }

        setSaving(true);
        try {
            const { data } = await updateZone(zone.id, buildZonePayload(form));
            // AC-08: back to the list, which shows the confirmation and the zone
            navigate('/admin/zones', {
                state: { zoneUpdated: { id: data.zone.id, name: data.zone.name, rateChanged } },
            });
        } catch (err) {
            // Someone may have booked meanwhile: the hint shows the new number
            const { spotsInUse: inUse, vehicleType } = err.response?.data ?? {};
            if (Number.isInteger(inUse) && vehicleType) setSpotsInUse((prev) => ({ ...prev, [vehicleType]: inUse }));
            showApiError(err);
            setSaving(false);
        }
    };

    // AC-06: discards the changes and goes back to the list
    const handleCancel = () => navigate('/admin/zones');

    const openDialog = () => {
        setToggleError('');
        setDialogOpen(true);
    };

    const closeDialog = useCallback(() => {
        setDialogOpen(false);
        setToggleError('');
    }, []);

    const handleConfirmToggle = async () => {
        setToggling(true);
        setToggleError('');
        try {
            const { data } = await toggleZone(zone.id, !zone.isActive);
            // Only the status changes: what was typed in the form stays there
            setZone((prev) => ({ ...prev, isActive: data.zone.isActive }));
            setToggleMessage(getZoneToggleSuccess(data.zone));
            setDialogOpen(false);
        } catch (err) {
            setToggleError(translateError(err.response?.data?.code));
        } finally {
            setToggling(false);
        }
    };

    const hints = {
        name: 'Nombre con el que los usuarios verán la zona. No puede repetirse.',
        address: 'Dirección exacta de la zona de parqueo.',
        // HU-29 AC-07: new hours do not move the reservations already made
        schedule: 'Si cambias el horario, aplica a las reservas y ampliaciones nuevas. Las reservas que ya existen no cambian.',
    };
    const typeHints = Object.fromEntries(VEHICLE_TYPES.map((type) => [type, typeHintsOf(type, original, form, spotsInUse)]));

    // HU-19 AC-08: the warning counts reservations, not spots
    const dialog = getZoneToggleDialog({ ...zone, activeReservations });

    return (
        <div className={PAGE_CLASS}>
            <title>Editar zona | PARKEA</title>
            <PageTitle zone={zone} />

            <form onSubmit={handleSubmit} noValidate className="mt-6 rounded-lg border border-neutral-200 bg-white">
                <ZoneFormFields zoneForm={zoneForm} hints={hints} typeHints={typeHints} keepOneChecked />

                {/* AC-07: outcome of activating or deactivating, next to the button */}
                <div role="status" aria-live="polite">
                    {toggleMessage && (
                        <p className="mx-5 mb-5 flex items-start gap-2 rounded-md bg-parkea-50 px-3 py-2 text-caption text-parkea-700 sm:mx-8 sm:mb-8">
                            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                            {toggleMessage}
                        </p>
                    )}
                </div>

                {/* AC-06 / AC-07: cancel, activate or deactivate, and save */}
                <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="flex items-center justify-center gap-2 rounded-md border border-danger bg-white px-5 py-2.5 text-label text-danger transition-colors hover:bg-danger-soft"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Cancelar
                    </button>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            onClick={openDialog}
                            disabled={saving}
                            className={`flex items-center justify-center gap-2 rounded-md border bg-white px-5 py-2.5 text-label transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${zone.isActive ? 'border-danger text-danger hover:bg-danger-soft' : 'border-parkea-600 text-parkea-600 hover:bg-parkea-50'}`}
                        >
                            {zone.isActive ? (
                                <PowerOff className="h-4 w-4" aria-hidden="true" />
                            ) : (
                                <Power className="h-4 w-4" aria-hidden="true" />
                            )}
                            {zone.isActive ? 'Desactivar zona' : 'Activar zona'}
                        </button>
                        <button
                            type="submit"
                            disabled={saving || toggling}
                            className="flex items-center justify-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label font-medium text-white transition-colors hover:bg-parkea-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Save className="h-4 w-4" aria-hidden="true" />
                            {saving ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                    </div>
                </div>
            </form>

            <ConfirmDialog
                open={dialogOpen}
                variant={dialog.variant}
                title={dialog.title}
                message={dialog.message}
                confirmLabel={dialog.confirmLabel}
                cancelLabel="Cancelar"
                confirming={toggling}
                error={toggleError}
                onConfirm={handleConfirmToggle}
                onCancel={closeDialog}
            />
        </div>
    );
}

// HU-31 AC-04 to AC-06: the lines under the spots and the rate of a type, and
// the line of a type that is unchecked
function typeHintsOf(type, original, form, spotsInUse) {
    const before = original.vehicleTypes[type];
    const now = form.vehicleTypes[type];
    const inUse = spotsInUse[type] ?? 0;
    const plural = vehicleTypePlural(type);

    // AC-04: "Mínimo 4: hay 4 cupos con reservas", and how many stay free
    let totalSlots = `Entre 1 y ${ZONE_LIMITS.maxSlots}.`;
    if (inUse > 0) {
        totalSlots = `Mínimo ${inUse}: ${inUse === 1 ? 'hay 1 cupo' : `hay ${inUse} cupos`} con reservas pendientes o activas.`;
    }
    const slots = Number(now.totalSlots);
    if (before.checked && now.totalSlots !== before.totalSlots && Number.isInteger(slots) && slots >= Math.max(inUse, 1) && slots <= ZONE_LIMITS.maxSlots) {
        const free = slots - inUse;
        totalSlots += ` Con ${slots} ${slots === 1 ? 'cupo' : 'cupos'} ${free === 1 ? 'quedará 1 disponible' : `quedarán ${free} disponibles`}.`;
    }

    // AC-06: a new rate only applies to the reservations made from now on
    let hourlyRate = 'Valor en pesos por cada hora de parqueo.';
    if (now.hourlyRate !== '') {
        hourlyRate = before.hourlyRate !== '' && Number(now.hourlyRate) !== Number(before.hourlyRate)
            ? `Las reservas nuevas de ${plural} pagarán ${formatCurrency(now.hourlyRate)} por hora. Las que ya existen mantienen ${formatCurrency(before.hourlyRate)}.`
            : `Se cobrarán ${formatCurrency(now.hourlyRate)} por cada hora de parqueo.`;
    }

    // AC-05: a type off keeps its spots and its rate
    let off;
    if (before.checked) {
        off = `Al guardar, la zona dejará de recibir reservas nuevas de ${plural}. Las que ya tiene seguirán válidas.`;
    } else if (before.totalSlots !== '') {
        off = `No recibe ${plural}. Si marcas este tipo, vuelve con ${before.totalSlots} ${before.totalSlots === '1' ? 'cupo' : 'cupos'} y ${formatCurrency(before.hourlyRate)} por hora.`;
    }
    return { totalSlots, hourlyRate, off };
}
