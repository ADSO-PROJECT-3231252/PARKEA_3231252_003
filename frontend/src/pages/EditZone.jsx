import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { X, Save, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { getZone, updateZone } from '../services/zoneService';
import { formatCurrency } from '../utils/format';
import { ZONE_LIMITS, zoneToForm, validateZoneForm, buildZonePayload } from '../utils/zoneForm';
import useZoneForm from '../hooks/useZoneForm';
import ZoneFormFields from '../components/ZoneFormFields';
import ZoneStatusBadge from '../components/ZoneStatusBadge';

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

export default function EditZone() {
    const { id } = useParams();
    const [zone, setZone] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null); // null | 'not_found' | 'generic'

    const fetchZone = useCallback(() => {
        getZone(id)
            .then(({ data }) => {
                setZone(data.zone);
                setFetchError(null);
            })
            .catch((err) => {
                const code = err.response?.data?.code;
                setFetchError(code === 'ZONE_NOT_FOUND' ? 'not_found' : 'generic');
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

    return <EditZoneForm initialZone={zone} />;
}

function EditZoneForm({ initialZone }) {
    const navigate = useNavigate();
    const [zone] = useState(initialZone);
    const [original] = useState(() => zoneToForm(initialZone));
    const zoneForm = useZoneForm(original);
    const { form, setServerError, showErrors, showApiError } = zoneForm;
    const [saving, setSaving] = useState(false);

    const rate = form.hourlyRate === '' ? null : Number(form.hourlyRate);
    const rateChanged = rate !== null && rate !== Number(original.hourlyRate);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        setServerError('');

        // AC-02: the same rules as HU-20
        const newErrors = validateZoneForm(form);
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
            showApiError(err);
            setSaving(false);
        }
    };

    // AC-06: discards the changes and goes back to the list
    const handleCancel = () => navigate('/admin/zones');

    const hints = {
        name: 'Nombre con el que los usuarios verán la zona. No puede repetirse.',
        address: 'Dirección exacta de la zona de parqueo.',
        totalSlots: `Número total de cupos de la zona, entre 1 y ${ZONE_LIMITS.maxSlots}.`,
        hourlyRate:
            rate === null
                ? 'Valor en pesos que se cobrará por cada hora de parqueo.'
                : `Se cobrarán ${formatCurrency(rate)} por cada hora de parqueo.`,
    };

    return (
        <div className={PAGE_CLASS}>
            <PageTitle zone={zone} />

            <form onSubmit={handleSubmit} noValidate className="mt-6 rounded-lg border border-neutral-200 bg-white">
                <ZoneFormFields zoneForm={zoneForm} hints={hints} />

                {/* AC-06: cancel and save */}
                <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="flex items-center justify-center gap-2 rounded-md border border-danger bg-white px-5 py-2.5 text-label text-danger transition-colors hover:bg-danger-soft"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center justify-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label font-medium text-white transition-colors hover:bg-parkea-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        {saving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </form>
        </div>
    );
}
