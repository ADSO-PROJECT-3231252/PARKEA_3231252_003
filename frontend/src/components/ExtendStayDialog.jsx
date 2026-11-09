import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { extendStay } from '../services/reservationService';
import { translateError } from '../utils/errorMessages';
import { formatCurrency, formatDate, formatTime, keepTogether } from '../utils/format';
import { hoursLabel } from '../utils/openStay';
import { extendErrorMessage, extensionCharge, extensionOptions, formatAddedTime } from '../utils/extendStay';

// Value of the "Tiempo indefinido" option; the others are the new exit times.
const OPEN_STAY = 'open';

// Codes that mean the screen behind the dialog is out of date (the stay
// ended, changed or no longer exists), so it is loaded again on close.
const STALE_CODES = ['RESERVATION_NOT_FOUND', 'STAY_NOT_ACTIVE', 'ALREADY_OPEN_STAY', 'EXIT_TIME_PASSED', 'RESERVATION_CHANGED'];

// A time such as "03:00 p. m." already ends with a period, which also closes
// the sentence, so a second one is not added.
const sentence = (text) => (text.endsWith('.') ? text : `${text}.`);

// A time or an amount inside a sentence, kept on one line.
const timeOf = (iso) => keepTogether(formatTime(iso));
const moneyOf = (amount) => keepTogether(formatCurrency(amount));

// The new exit times grouped by day, so each option only needs its time.
function groupByDay(options) {
    const groups = [];
    options.forEach((iso) => {
        const day = formatDate(iso);
        const last = groups[groups.length - 1];
        if (last && last.day === day) {
            last.options.push(iso);
        } else {
            groups.push({ day, options: [iso] });
        }
    });
    return groups;
}

// What the chosen option means, under the field (AC-06, AC-07).
function choiceSummary(choice, reservation, hourlyRate, paid) {
    if (choice === OPEN_STAY) {
        return (
            `No pagas nada ahora. Cuando salgas, usa “Terminar estadía”: se cobra ${moneyOf(hourlyRate)} ` +
            `por cada hora empezada desde la entrada, hasta 24 horas, menos los ${moneyOf(paid)} que ya ` +
            'pagaste. Lo que ya pagaste no se devuelve.'
        );
    }
    const charge = extensionCharge(reservation.endTime, choice, hourlyRate);
    const exactHours = (new Date(choice) - new Date(reservation.endTime)) % (60 * 60 * 1000) === 0;
    return (
        `${sentence(`Nueva salida: ${formatDate(choice)}, ${timeOf(choice)}`)} Pagas ${moneyOf(charge.amount)} ` +
        (exactHours
            ? `por ${hoursLabel(charge.hours)} más.`
            : `por ${hoursLabel(charge.hours)}: cada hora empezada se cobra completa.`)
    );
}

// HU-28: choose a later exit time, paid on the payment screen (AC-06), or
// switch to an open stay, paid when it ends (AC-07). Rendered only while open,
// so its state starts fresh every time.
// hourlyRate: the rate stored in the reservation. paid: what it paid so far.
// openedAt: the moment "Ampliar estadía" was clicked.
// onClose({ stale }): nothing changed; stale = reload the screen.
// onExtended(message): switched to an open stay; message is the result.
export default function ExtendStayDialog({ reservation, hourlyRate, paid, openedAt, onClose, onExtended }) {
    const navigate = useNavigate();
    // The screen behind may have been loaded before the exit time passed.
    const exitPassed = new Date(reservation.endTime).getTime() <= openedAt;
    const [options] = useState(() => (exitPassed ? [] : extensionOptions(reservation)));
    const [choice, setChoice] = useState(() => options[0] ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(() => (exitPassed ? translateError('EXIT_TIME_PASSED') : ''));
    const [stale, setStale] = useState(exitPassed);

    const zoneName = reservation.zone?.name ?? 'la zona';
    const toOpenStay = choice === OPEN_STAY;
    const exitText = `el ${formatDate(reservation.endTime)} a las ${timeOf(reservation.endTime)}`;

    const handleClose = () => {
        if (saving) return;
        onClose({ stale });
    };

    const handleChange = (e) => {
        setChoice(e.target.value);
        // The error was about the previous choice (for example, an overlap).
        if (!stale) setError('');
    };

    const handleConfirm = () => {
        if (!toOpenStay) {
            // AC-06: paid on the same payment screen; the exit time the user saw
            // goes along, so nothing is charged if it changes in the meantime.
            const params = new URLSearchParams({ extendTo: choice, from: reservation.endTime });
            navigate(`/reservations/${reservation.id}/payment?${params}`);
            return;
        }
        setSaving(true);
        setError('');
        extendStay(reservation.id, { fromEndTime: reservation.endTime, openEnded: true })
            .then(() =>
                onExtended(
                    `Tu reserva en ${zoneName} quedó en tiempo indefinido. No se cobró nada ahora; ` +
                        'cuando salgas, usa “Terminar estadía” para pagar el resto.'
                )
            )
            .catch((err) => {
                const code = err.response?.data?.code;
                setError(extendErrorMessage(code, true));
                if (STALE_CODES.includes(code)) setStale(true);
            })
            .finally(() => setSaving(false));
    };

    return (
        <ConfirmDialog
            open
            title="Ampliar estadía"
            message={
                exitPassed
                    ? sentence(`Tu salida era ${exitText}`)
                    : `${sentence(`Tu salida actual es ${exitText}`)} Puedes ampliarla hasta 24 horas desde la ` +
                      `entrada y conservas el mismo cupo (${reservation.spotNumber}).`
            }
            confirmLabel={toOpenStay ? 'Cambiar a tiempo indefinido' : 'Continuar al pago'}
            cancelLabel="Volver"
            confirming={saving}
            confirmDisabled={stale}
            error={error}
            onConfirm={handleConfirm}
            onCancel={handleClose}
        >
            {!exitPassed && (
                <>
                    <label htmlFor="extend-choice" className="block text-label text-neutral-700">
                        Nueva hora de salida
                    </label>
                    <select
                        id="extend-choice"
                        value={choice}
                        onChange={handleChange}
                        disabled={saving}
                        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 disabled:opacity-60"
                    >
                        {groupByDay(options).map(({ day, options: times }) => (
                            <optgroup key={day} label={day}>
                                {times.map((iso) => (
                                    <option key={iso} value={iso}>
                                        {formatTime(iso)} ({formatAddedTime(reservation.endTime, iso)})
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        {/* AC-02/AC-07 */}
                        <optgroup label="Sin hora de salida">
                            <option value={OPEN_STAY}>Tiempo indefinido</option>
                        </optgroup>
                    </select>
                    <p aria-live="polite" className="mt-2 text-caption text-neutral-600">
                        {choiceSummary(choice, reservation, hourlyRate, paid)}
                    </p>
                </>
            )}
        </ConfirmDialog>
    );
}
