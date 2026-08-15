import { useState } from 'react';
import logo from '../assets/logo.png';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { isValidEmail, isNotEmpty } from '../utils/validators';
import { login } from '../services/authService';
import { useAuth } from '../context/AuthContext';

function EyeIcon({ open }) {
    return open ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    );
}

export default function Login() {
    const [form, setForm] = useState({ email: '', password: '' });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { loginUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const justRegistered = location.state?.registered;

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
            const { data } = await login(form);
            loginUser(data.token, data.user);
            navigate('/dashboard');
        } catch (err) {
            // AC-08: mensaje genérico siempre, sin importar si falló el email o la contraseña
            if (err.response?.status === 401) {
                setServerError('Credenciales inválidas.');
            } else {
                setServerError('No se pudo iniciar sesión. Intenta de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-10">
            <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-neutral-200 p-8">

                {/* Logo */}
                <div className="flex flex-col items-center mb-6">
                    <img src={logo} alt="PARKEA" className="h-12 w-auto object-contain" />
                    <p className="font-sans text-caption text-parkea-600 mt-1">
                        Reserva tu parqueo, simplifica tu día.
                    </p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div className="text-center">
                        <h1 className="font-display text-title text-neutral-900 uppercase">
                            Iniciar sesión
                        </h1>
                        <p className="font-sans text-body text-neutral-600 mt-1">
                            Ingresa tus datos para acceder a tu cuenta.
                        </p>
                    </div>

                    {justRegistered && !serverError && (
                        <p role="status" className="text-caption text-parkea-700 bg-parkea-50 rounded-md px-3 py-2 text-center">
                            Registro completado. Por favor inicia sesión.
                        </p>
                    )}
                    {serverError && (
                        <p role="alert" className="text-caption text-danger bg-danger-soft rounded-md px-3 py-2 text-center">
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
                            placeholder="Ej: correo@ejemplo.com"
                            value={form.email}
                            onChange={handleChange}
                            aria-invalid={Boolean(errors.email)}
                            aria-describedby={errors.email ? 'email-error' : undefined}
                            className={`w-full rounded-[10px] border px-3 py-2.5 font-sans text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                                errors.email ? 'border-danger' : 'border-neutral-200'
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
                                className={`w-full rounded-[10px] border px-3 py-2.5 pr-10 font-sans text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                                    errors.password ? 'border-danger' : 'border-neutral-200'
                                }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
                            >
                                <EyeIcon open={showPassword} />
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
                        className="w-full rounded-[10px] bg-parkea-600 text-white font-sans font-medium py-2.5 hover:bg-parkea-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-parkea-600 transition disabled:opacity-60"
                    >
                        {loading ? 'Ingresando...' : 'Iniciar sesión'}
                    </button>

                    <div className="text-center">
                        <Link to="/forgot-password" className="text-label text-neutral-600 underline hover:text-neutral-800">
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-neutral-200" />
                        <span className="w-1.5 h-1.5 rounded-full bg-parkea-600" />
                        <div className="h-px flex-1 bg-neutral-200" />
                    </div>

                    <Link
                        to="/admin/login"
                        className="flex items-center justify-center gap-2 text-label text-parkea-700 hover:text-parkea-800"
                    >
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-parkea-50">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
                            </svg>
                        </span>
                        Iniciar sesión como administrador
                    </Link>

                    <p className="text-center text-body text-neutral-600">
                        ¿No tienes cuenta?{' '}
                        <Link to="/register" className="text-parkea-600 font-medium underline hover:text-parkea-700">
                            Regístrate aquí
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
}