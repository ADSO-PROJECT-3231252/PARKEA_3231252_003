import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    AlertCircle,
    RefreshCw,
    Ban,
} from 'lucide-react';
import { getReservation } from '../services/reservationService';
import { RESERVATION_STATUS, FALLBACK_STATUS } from '../utils/reservationStatus';

export default function ReservationConfirmation() {
    const { id } = useParams();

    const [reservation, setReservation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const fetchReservation = useCallback(() => {
        getReservation(id)
            .then(({ data }) => {
                setReservation(data.reservation);
                setError(false);
                setNotFound(false);
            })
            .catch((err) => {
                if (err.response?.data?.code === 'RESERVATION_NOT_FOUND') {
                    setNotFound(true);
                } else {
                    setError(true);
                }
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        fetchReservation();
    }, [fetchReservation]);

    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchReservation();
    };

    if (loading) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <h1 className="sr-only">Confirmación de reserva</h1>
                <p role="status" aria-live="polite" className="text-body text-neutral-600">
                    Cargando…
                </p>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <h1 className="sr-only">Confirmación de reserva</h1>
                <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-5">
                    <p className="flex items-center gap-2 text-body text-neutral-600">
                        <Ban className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                        No encontramos esta reserva.
                    </p>
                    <Link
                        to="/reservations"
                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                    >
                        Ver mis reservas
                    </Link>
                </div>
            </div>
        );
    }

    if (error || !reservation) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <h1 className="sr-only">Confirmación de reserva</h1>
                <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger-soft bg-danger-soft p-5">
                    <p className="flex items-center gap-2 text-body text-danger">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        No pudimos cargar esta reserva.
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
            </div>
        );
    }

    // An unknown status shows its own name instead of pretending to be Pending.
    const { label: statusLabel = reservation.status, Icon: StatusIcon, badge: statusBadge } =
        RESERVATION_STATUS[reservation.status] ?? FALLBACK_STATUS;

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="sr-only">Confirmación de reserva</h1>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-lg border border-neutral-200 bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-title font-display uppercase text-neutral-900">Detalles de la reserva</h2>
                        <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-label font-medium ${statusBadge}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {statusLabel}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}