import { Link, useLocation } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import ResendEmailButton from '../components/ResendEmailButton';

// HU-30 (AC-01): after signing up, the account is not verified yet. The
// screen says the email was sent and to open it to activate the account.
// Register.jsx hands over the email through router state.
export default function CheckEmail() {
    const email = useLocation().state?.email;

    return (
        <AuthCard pageTitle="Revisa tu correo" title="Revisa tu correo" icon={Mail}>
            <div role="status" className="font-sans text-body text-neutral-700 text-center space-y-3 mb-5">
                <p>
                    Te enviamos un enlace para confirmar tu correo
                    {email ? (
                        <>
                            {' '}a <strong className="break-all text-neutral-900">{email}</strong>
                        </>
                    ) : null}
                    .
                </p>
                <p>Ábrelo en las próximas 24 horas para activar tu cuenta.</p>
            </div>

            {email ? (
                <>
                    <p className="font-sans text-caption text-neutral-600 text-center mb-2">
                        ¿No te llegó? Revisa la carpeta de spam o pide otro.
                    </p>
                    <ResendEmailButton email={email} />
                </>
            ) : (
                <p className="text-center">
                    <Link
                        to="/verify-email/resend"
                        className="text-caption text-parkea-600 underline hover:text-parkea-700"
                    >
                        Pedir un nuevo enlace
                    </Link>
                </p>
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
                    Ir a iniciar sesión
                </Link>
            </div>
        </AuthCard>
    );
}
