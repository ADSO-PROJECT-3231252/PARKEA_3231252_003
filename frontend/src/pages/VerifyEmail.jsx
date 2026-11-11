import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, MailX } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import { verifyEmail } from '../services/authService';
import { translateError } from '../utils/errorMessages';

const PRIMARY_LINK =
    'block w-full rounded-md bg-parkea-600 text-white text-center font-sans font-medium py-2.5 hover:bg-parkea-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-parkea-600 transition';
const SECONDARY_LINK = 'text-caption text-parkea-600 underline hover:text-parkea-700';

// HU-30 (AC-02 and AC-03): the page the link of the verification email opens.
// It sends the token of the link to the API once and shows the result.
export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    // checking | verified | invalid | failed (no answer or a server error)
    const [state, setState] = useState(token ? 'checking' : 'invalid');
    const [error, setError] = useState('');
    // The link works only once, so the token is sent only once, even when
    // React runs the effect twice in development (StrictMode)
    const sentToken = useRef(null);

    const verify = useCallback(async () => {
        setState('checking');
        try {
            await verifyEmail({ token });
            setState('verified');
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'VERIFICATION_TOKEN_INVALID' || code === 'VALIDATION_ERROR') {
                setState('invalid');
            } else {
                setError(translateError(err.response ? code : 'INTERNAL_ERROR'));
                setState('failed');
            }
        }
    }, [token]);

    useEffect(() => {
        if (!token || sentToken.current === token) return;
        sentToken.current = token;
        verify();
    }, [token, verify]);

    if (state === 'verified') {
        return (
            <AuthCard pageTitle="Correo confirmado" title="Correo confirmado" icon={MailCheck}>
                <p role="status" className="font-sans text-body text-neutral-700 text-center mb-5">
                    Tu cuenta de PARKEA ya está activa. Ya puedes iniciar sesión.
                </p>
                <Link to="/login" className={PRIMARY_LINK}>
                    Iniciar sesión
                </Link>
            </AuthCard>
        );
    }

    if (state === 'invalid') {
        return (
            <AuthCard pageTitle="Enlace no válido" title="Enlace no válido" icon={MailX}>
                <p role="alert" className="text-caption text-danger bg-danger-soft rounded-md px-3 py-2 text-center mb-4">
                    {translateError('VERIFICATION_TOKEN_INVALID')}
                </p>
                <p className="font-sans text-body text-neutral-600 text-center mb-5">
                    Si ya confirmaste tu correo, inicia sesión. Si no, pide un nuevo enlace.
                </p>
                <Link to="/verify-email/resend" className={PRIMARY_LINK}>
                    Pedir un nuevo enlace
                </Link>
                <p className="text-center mt-4">
                    <Link to="/login" className={SECONDARY_LINK}>
                        Ir a iniciar sesión
                    </Link>
                </p>
            </AuthCard>
        );
    }

    if (state === 'failed') {
        return (
            <AuthCard pageTitle="Confirmar correo" title="Confirmar correo" icon={MailCheck}>
                <p role="alert" className="text-caption text-danger bg-danger-soft rounded-md px-3 py-2 text-center mb-5">
                    {error}
                </p>
                <button
                    type="button"
                    onClick={verify}
                    className="w-full rounded-md bg-parkea-600 text-white font-sans font-medium py-2.5 hover:bg-parkea-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-parkea-600 transition"
                >
                    Intentar de nuevo
                </button>
            </AuthCard>
        );
    }

    return (
        <AuthCard pageTitle="Confirmar correo" title="Confirmar correo" icon={MailCheck}>
            <p role="status" className="font-sans text-body text-neutral-600 text-center">
                Confirmando tu correo...
            </p>
        </AuthCard>
    );
}
