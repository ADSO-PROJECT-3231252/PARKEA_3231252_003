import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, UserRound, ArrowLeft } from 'lucide-react';
import { isValidEmail, isNotEmpty } from '../utils/validators';
import { loginAdmin } from '../services/authService';
import { translateError } from '../utils/errorMessages';
import { useAuth } from '../hooks/useAuth';
import logo from '../assets/logo.png';

export default function AdminLogin() {
    const [form, setForm] = useState({ email: '', password: '' });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { loginUser } = useAuth();
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const validate = () => {
        const newErrors = {};

        if (!isNotEmpty(form.email)) {
            newErrors.email = 'El correo es obligatorio.';
        } else if (!isValidEmail(form.email)) {
            newErrors.email = 'Ingresa un correo válido.';
        }

        if (!isNotEmpty(form.password)) {
            newErrors.password = 'La contraseña es obligatoria.';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setServerError('');
        if (!validate()) return;

        setLoading(true);
        try {
            const { data } = await loginAdmin(form);
            loginUser(data.token, data.user);
            navigate('/admin/dashboard');
        } catch (err) {
            // AC-06: NOT_ADMIN_ACCOUNT revela el motivo a propósito,
            // a diferencia de las credenciales inválidas
            const code = err.response?.data?.code;
            setServerError(translateError(code));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-10">
            <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-neutral-200
                overflow-hidden">

                <div className="bg-parkea-700 h-12 flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-white" aria-hidden="true" />
                </div>

                <div className="p-8">
                    <div className="flex flex-col items-center mb-6">
                        <img src={logo} alt="PARKEA" className="h-12 w-auto object-contain" />
                        <p className="font-sans text-caption text-parkea-600 mt-1">
                            Reserva tu parqueo, simplifica tu día.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} noValidate className="space-y-5">
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2">
                                <UserRound className="h-5 w-5 text-neutral-900" aria-hidden="true" />
                                <h1 className="font-display text-title text-neutral-900 uppercase">
                                    Acceso administrador
                                </h1>
                            </div>
                            <p className="font-sans text-body text-neutral-600 mt-1">
                                Ingresa tus credenciales para acceder al panel administrativo.
                            </p>
                        </div>

                        {serverError && (
                            <p
                                role="alert"
                                className="text-caption text-danger bg-danger-soft rounded-md px-3 py-2 text-center"
                            >
                                {serverError}
                            </p>
                        )}

                        <div>
                            <label htmlFor="email" className="block font-sans text-label text-neutral-700 mb-1">
                                Correo electrónico
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="Ej: administrador@parkea.gov.co"
                                value={form.email}
                                onChange={handleChange}
                                aria-invalid={Boolean(errors.email)}
                                aria-describedby={errors.email ? 'email-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2.5 font-sans text-body
                                    text-neutral-900 placeholder:text-neutral-400 focus:outline-none
                                    focus:ring-2 focus:ring-parkea-600 ${errors.email
                                        ? 'border-danger'
                                        : 'border-neutral-200'
                                    }`}
                            />
                            {errors.email && (
                                <p id="email-error" role="alert" className="mt-1 text-caption text-danger">
                                    {errors.email}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="password" className="block font-sans text-label text-neutral-700 mb-1">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Ingresa tu contraseña"
                                    value={form.password}
                                    onChange={handleChange}
                                    aria-invalid={Boolean(errors.password)}
                                    aria-describedby={errors.password ? 'password-error' : undefined}
                                    className={`w-full rounded-md border px-3 py-2.5 pr-9 font-sans text-body
                                        text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600
                                        ${errors.password
                                            ? 'border-danger'
                                            : 'border-neutral-200'
                                        }`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500
                                        hover:text-neutral-700"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                                    ) : (
                                        <Eye className="h-4 w-4" aria-hidden="true" />
                                    )}
                                </button>
                            </div>
                            {errors.password && (
                                <p id="password-error" role="alert" className="mt-1 text-caption text-danger">
                                    {errors.password}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-md bg-parkea-700 text-white font-sans font-medium py-2.5
                                hover:bg-parkea-800 focus:outline-none focus:ring-2 focus:ring-offset-2
                                focus:ring-parkea-700 transition disabled:opacity-60"
                        >
                            {loading ? 'Ingresando...' : 'Iniciar sesión'}
                        </button>

                        <div className="text-center">
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-1 text-caption text-parkea-600 underline
                                    hover:text-parkea-700"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                Volver al inicio de sesión de usuario
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}