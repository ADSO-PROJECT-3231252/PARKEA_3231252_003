import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';
import { isValidEmail, isNotEmpty } from '../utils/validators';
import { forgotPassword } from '../services/authService';
import logo from '../assets/logo.png';
export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [errors, setErrors] = useState({});
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);
    const handleChange = (e) => {
        setEmail(e.target.value);
        if (errors.email) setErrors({});
    };
    const validate = () => {
        const newErrors = {};
        if (!isNotEmpty(email)) {
            newErrors.email = 'El correo es obligatorio.';
        } else if (!isValidEmail(email)) {
            newErrors.email = 'Ingresa un correo válido.';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            // AC-04: el backend siempre responde igual, exista o no el correo
            await forgotPassword({ email });
        } catch {
            // Silenciado a propósito: nunca reveles si la petición falló por
            // el correo (AC-04) — solo importa si fue un error real de red/servidor
        } finally {
            setLoading(false);
            setSent(true);
        }
    };
    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-10">
            <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-neutral-200 p-8">
                <div className="flex flex-col items-center mb-6">
                    <img src={logo} alt="PARKEA" className="h-15 w-auto object-contain" />
                    <p className="font-sans text-caption text-parkea-600 mt-1">
                        Reserva tu parqueo, simplifica tu día.
                    </p>
                </div>
                <div className="text-center mb-2">
                    <h1 className="font-display text-title text-neutral-900 uppercase">
                        Recuperar contraseña
                    </h1>
                </div>
                <div className="flex items-center gap-3 my-4">
                    <div className="h-px flex-1 bg-neutral-200" />
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-parkea-50">
                        <Lock className="h-4 w-4 text-parkea-600" aria-hidden="true" />
                    </span>
                    <div className="h-px flex-1 bg-neutral-200" />
                </div>
                {sent ? (
                    <p
                        role="status"
                        className="text-caption text-parkea-700 bg-parkea-50 rounded-md px-3 py-2 text-center"
                    >
                        Si existe una cuenta con ese correo, te hemos enviado un enlace de recuperación.
                    </p>
                ) : (
                    <>
                        <p className="font-sans text-body text-neutral-600 text-center mb-4">
                            Ingresa tu correo electrónico y te enviaremos un enlace para que puedas
                            restablecer tu contraseña.
                        </p>
                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block font-sans text-label text-neutral-700 mb-1"
                                >
                                    Correo electrónico
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="Ej: correo@ejemplo.com"
                                    value={email}
                                    onChange={handleChange}
                                    aria-invalid={Boolean(errors.email)}
                                    aria-describedby={errors.email ? 'email-error' : undefined}
                                    className={`w-full rounded-md border px-3 py-2.5 font-sans text-body
text-neutral-900 placeholder:text-neutral-400 focus:outline-none
focus:ring-2 focus:ring-parkea-600 ${errors.email ? 'border-danger' : 'border-neutral-200'}`}
                                />
                                {errors.email && (
                                    <p
                                        id="email-error"
                                        role="alert"
                                        className="mt-1 text-caption text-danger"
                                    >
                                        {errors.email}
                                    </p>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full rounded-md bg-parkea-600 text-white font-sans font-medium
py-2.5 hover:bg-parkea-700 focus:outline-none focus:ring-2
focus:ring-offset-2 focus:ring-parkea-600 transition disabled:opacity-60"
                            >
                                {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
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
                        className="inline-flex items-center gap-1 text-caption text-parkea-600 underline
hover:text-parkea-700"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        Volver a iniciar sesión
                    </Link>
                </div>
            </div>
        </div>
    );
}
