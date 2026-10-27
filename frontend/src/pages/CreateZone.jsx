import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Save } from 'lucide-react';
import { createZone } from '../services/zoneService';
import { formatCurrency } from '../utils/format';
import { ZONE_LIMITS, validateZoneForm, buildZonePayload } from '../utils/zoneForm';
import useZoneForm from '../hooks/useZoneForm';
import ZoneFormFields from '../components/ZoneFormFields';

export default function CreateZone() {
    const navigate = useNavigate();
    const zoneForm = useZoneForm();
    const { form, setServerError, showErrors, showApiError } = zoneForm;
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        setServerError('');

        const newErrors = validateZoneForm(form);
        if (Object.keys(newErrors).length > 0) {
            showErrors(newErrors);
            return;
        }

        setSaving(true);
        try {
            const { data } = await createZone(buildZonePayload(form));
            // AC-09: back to the list, which shows the confirmation and the new zone
            navigate('/admin/zones', { state: { zoneCreated: { id: data.zone.id, name: data.zone.name } } });
        } catch (err) {
            showApiError(err);
            setSaving(false);
        }
    };

    // AC-07: discards what was typed and goes back to the list
    const handleCancel = () => navigate('/admin/zones');

    const rate = form.hourlyRate === '' ? null : Number(form.hourlyRate);
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
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="text-title font-display uppercase text-neutral-900">Crear zona</h1>
            <p className="mt-1 text-body text-neutral-600">
                Registra una nueva zona de parqueo en el sistema. Los campos marcados con{' '}
                <span className="text-danger" aria-hidden="true">*</span>
                <span className="sr-only">asterisco</span> son obligatorios.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-6 rounded-lg border border-neutral-200 bg-white">
                <ZoneFormFields zoneForm={zoneForm} hints={hints} />

                {/* AC-07: cancel and save */}
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
                        {saving ? 'Guardando…' : 'Guardar zona'}
                    </button>
                </div>
            </form>
        </div>
    );
}
