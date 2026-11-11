import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import { isValidEmail, isNotEmpty } from '../utils/validators';
import { resendVerification } from '../services/authService';
import { translateError } from '../utils/errorMessages';

// HU-30 (AC-03 and AC-05): asks for a new verification link when the screen
// does not know the email (for example, from a link that is no longer valid).
// Same behavior as ForgotPassword: the answer never reveals whether the
// account exists.
export default function ResendVerification() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [serverError, setServerError] = useState('');
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setEmail(e.target.value);
        if (error) setError('');
        if (serverError) setServerError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setServerError('');
        if (!isNotEmpty(email)) {
            setError('El correo es obligatorio.');
            return;
        }
        if (!isValidEmail(email)) {
            setError('Ingresa un correo válido.');
            return;
        }

        setLoading(true);
        try {
            await resendVerification({ email });
            setSent(true);
        } catch (err) {
            if (!err.response) {
                setServerError(translateError('INTERNAL_ERROR'));
            } else if (err.response.data?.code === 'TOO_MANY_REQUESTS') {
                setServerError(translateError('TOO_MANY_REQUESTS'));
            } else {
                setSent(true);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthCard pageTitle="Nuevo enlace de confirmación" title="Confirmar correo" icon={Mail}>
            {sent ? (
                <p role="status" className="text-caption text-parkea-700 bg-parkea-50 rounded-md px-3 py-2 text-center">
                    Si la cuenta aún no está confirmada, te enviamos un nuevo enlace. Revisa tu correo.
                </p>
            ) : (
                <>
                    <p className="font-sans text-body text-neutral-600 text-center mb-4">
                        Ingresa el correo con el que te registraste y te enviaremos un nuevo enlace para
                        activar tu cuenta.
                    </p>
                    {serverError && (
                        <p role="alert" className="mb-4 text-caption text-danger bg-danger-soft rounded-md px-3 py-2 text-center">
                            {serverError}
                        </p>
                    )}
                    <form onSubmit={handleSubmit} noValidate className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block font-sans text-label text-neutral-700 mb-1">
                                Correo electrónico
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                maxLength={100}
                                placeholder="Ej: correo@ejemplo.com"
                                value={email}
                                onChange={handleChange}
                                aria-invalid={Boolean(error)}
                                aria-describedby={error ? 'email-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2.5 font-sans text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${error ? 'border-danger' : 'border-neutral-200'}`}
                            />
                            {error && (
                                <p id="email-error" role="alert" className="mt-1 text-caption text-danger">
                                    {error}
                                </p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-md bg-parkea-600 text-white font-sans font-medium py-2.5 hover:bg-parkea-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-parkea-600 transition disabled:opacity-60"
                        >
                            {loading ? 'Enviando...' : 'Enviar nuevo enlace'}
                        </button>
                    </form>
                </>
            )}
            <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="w-1.5 h-1.5 rounded-full bg-parkea-600" />
                <div className="h-px flex-1 bg-neutral-200" />
            </div>
            <div className="text-center">
                <Link
                    to="/login"
                    className="inline-flex items-center gap-1 text-caption text-parkea-600 underline hover:text-parkea-700"
                >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Volver a iniciar sesión
                </Link>
            </div>
        </AuthCard>
    );
}
