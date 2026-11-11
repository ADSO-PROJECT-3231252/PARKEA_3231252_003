import { useState } from 'react';
import { resendVerification } from '../services/authService';
import { translateError } from '../utils/errorMessages';

const SENT_MESSAGE = 'Si la cuenta aún no está confirmada, te enviamos un nuevo enlace. Revisa tu correo.';

// HU-30 (AC-05): "Reenviar correo" for an email the screen already knows
// (after signing up, or when the login answers EMAIL_NOT_VERIFIED). The
// backend answers the same way whether the account exists or not, so the
// message never reveals it either.
export default function ResendEmailButton({ email }) {
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleClick = async () => {
        setSending(true);
        setSent(false);
        setError('');
        try {
            await resendVerification({ email });
            setSent(true);
        } catch (err) {
            if (!err.response) {
                // The request never reached the server (no connection)
                setError(translateError('INTERNAL_ERROR'));
            } else if (err.response.data?.code === 'TOO_MANY_REQUESTS') {
                setError(translateError('TOO_MANY_REQUESTS'));
            } else {
                // Any other answer gets the same message as a success, so it
                // never reveals whether the account exists
                setSent(true);
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="text-center">
            <button
                type="button"
                onClick={handleClick}
                disabled={sending}
                className="rounded-md border border-parkea-600 px-4 py-2 font-sans text-label text-parkea-700
hover:bg-parkea-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-parkea-600 transition
disabled:opacity-60"
            >
                {sending ? 'Enviando...' : 'Reenviar correo'}
            </button>
            {/* Always in the page, so screen readers announce the message when it appears */}
            <p role="status" className="mt-2 text-caption text-parkea-700">
                {sent ? SENT_MESSAGE : ''}
            </p>
            {error && (
                <p role="alert" className="mt-2 text-caption text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
