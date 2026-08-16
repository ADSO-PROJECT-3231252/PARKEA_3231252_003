import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isValidEmail, isNotEmpty } from '../utils/validators';
import { register } from '../services/authService';
import logo from '../assets/logo.png';
import carImage from '../assets/car_register.png';

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

const DOCUMENT_TYPES = [
    { value: 'CC', label: 'CC' },
    { value: 'TI', label: 'TI' },
    { value: 'CE', label: 'CE' },
    { value: 'PASSPORT', label: 'Pasaporte' },
];

export default function Register() {
    const [form, setForm] = useState({
        documentType: 'CC',
        documentNumber: '',
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
    });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const validate = () => {
        const newErrors = {};

        if (!isNotEmpty(form.documentNumber)) {
            newErrors.documentNumber = 'El número de documento es obligatorio.';
        } else if (!/^[a-zA-Z0-9]+$/.test(form.documentNumber)) {
            newErrors.documentNumber = 'El documento solo debe contener letras y números.';
        }

        if (!isNotEmpty(form.fullName)) {
            newErrors.fullName = 'El nombre completo es obligatorio.';
        }

        if (!isNotEmpty(form.email)) {
            newErrors.email = 'El correo es obligatorio.';
        } else if (!isValidEmail(form.email)) {
            newErrors.email = 'Ingresa un correo válido.';
        }

        if (!isNotEmpty(form.password)) {
            newErrors.password = 'La contraseña es obligatoria.';
        } else if (
            form.password.length < 8 ||
            !/[A-Z]/.test(form.password) ||
            !/[0-9]/.test(form.password) ||
            !/[^A-Za-z0-9]/.test(form.password)
        ) {
            newErrors.password = 'Mínimo 8 caracteres, con una mayúscula, un número y un carácter especial.';
        }

        if (!isNotEmpty(form.confirmPassword)) {
            newErrors.confirmPassword = 'Confirma tu contraseña.';
        } else if (form.password !== form.confirmPassword) {
            newErrors.confirmPassword = 'Las contraseñas no coinciden.';
        }

        if (!isNotEmpty(form.phone)) {
            newErrors.phone = 'El teléfono es obligatorio.';
        } else if (!/^[0-9]{7,15}$/.test(form.phone)) {
            newErrors.phone = 'El teléfono debe contener solo números (7 a 15 dígitos).';
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
            await register({
                documentType: form.documentType,
                documentNumber: form.documentNumber,
                fullName: form.fullName,
                email: form.email,
                phone: form.phone,
                password: form.password,
                confirmPassword: form.confirmPassword,
            });
            navigate('/login', { state: { registered: true } });
        } catch (err) {
            const code = err.response?.data?.code;

            if (code === 'EMAIL_ALREADY_REGISTERED') {
                setErrors((prev) => ({ ...prev, email: 'Este correo ya está registrado.' }));
            } else if (code === 'DOCUMENT_ALREADY_REGISTERED') {
                setErrors((prev) => ({ ...prev, documentNumber: 'Este número de documento ya está registrado.' }));
            } else {
                setServerError('No se pudo completar el registro. Intenta de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen flex items-start justify-center bg-neutral-50 px-4 py-2 overflow-hidden">
            <div className="w-full max-w-5xl h-[calc(100vh-16px)] bg-white rounded-lg shadow-sm border border-neutral-200 flex flex-col md:flex-row overflow-hidden">
                {/* Columna del formulario */}
                <div className="flex-1 p-5 overflow-y-auto md:overflow-visible">
                    <div className="flex flex-col items-center mb-2">
                        <img src={logo} alt="PARKEA" className="h-15 w-auto object-contain" />
                    </div>

                    <div className="text-center mb-2">
                        <h1 className="font-display text-title text-neutral-900">
                            Crear <span className="text-parkea-600">cuenta</span>
                        </h1>
                        <p className="font-sans text-body text-neutral-600 mt-1">
                            Completa tus datos para comenzar a usar PARKEA
                        </p>
                    </div>

                    {serverError && (
                        <p role="alert" className="mb-2 text-caption text-danger bg-danger-soft rounded-md px-3 py-2 text-center">
                            {serverError}
                        </p>
                    )}

                    <form onSubmit={handleSubmit} noValidate className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="documentType" className="block font-sans text-label text-neutral-700 mb-1">
                                    Tipo de documento
                                </label>
                                <select
                                    id="documentType"
                                    name="documentType"
                                    value={form.documentType}
                                    onChange={handleChange}
                                    className="w-full rounded-md border border-neutral-200 px-3 py-2 font-sans text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                                >
                                    {DOCUMENT_TYPES.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="documentNumber" className="block font-sans text-label text-neutral-700 mb-1">
                                    Número de documento
                                </label>
                                <input
                                    id="documentNumber"
                                    name="documentNumber"
                                    type="text"
                                    placeholder="1234567890"
                                    value={form.documentNumber}
                                    onChange={handleChange}
                                    aria-invalid={Boolean(errors.documentNumber)}
                                    aria-describedby={errors.documentNumber ? 'documentNumber-error' : undefined}
                                    className={`w-full rounded-md border px-3 py-2 font-sans text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                                        errors.documentNumber ? 'border-danger' : 'border-neutral-200'
                                    }`}
                                />
                                {errors.documentNumber && (
                                    <p id="documentNumber-error" role="alert" className="mt-1 text-caption text-danger">
                                        {errors.documentNumber}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="fullName" className="block font-sans text-label text-neutral-700 mb-1">
                                Nombre completo
                            </label>
                            <input
                                id="fullName"
                                name="fullName"
                                type="text"
                                placeholder="Ej. Juan Pérez"
                                value={form.fullName}
                                onChange={handleChange}
                                aria-invalid={Boolean(errors.fullName)}
                                aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2 font-sans text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                                    errors.fullName ? 'border-danger' : 'border-neutral-200'
                                }`}
                            />
                            {errors.fullName && (
                                <p id="fullName-error" role="alert" className="mt-1 text-caption text-danger">
                                    {errors.fullName}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="email" className="block font-sans text-label text-neutral-700 mb-1">
                                Correo electrónico
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="ejemplo@correo.com"
                                value={form.email}
                                onChange={handleChange}
                                aria-invalid={Boolean(errors.email)}
                                aria-describedby={errors.email ? 'email-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2 font-sans text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                                    errors.email ? 'border-danger' : 'border-neutral-200'
                                }`}
                            />
                            {errors.email && (
                                <p id="email-error" role="alert" className="mt-1 text-caption text-danger">
                                    {errors.email}
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="password" className="block font-sans text-label text-neutral-700 mb-1">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={handleChange}
                                        aria-invalid={Boolean(errors.password)}
                                        aria-describedby={errors.password ? 'password-error' : 'password-hint'}
                                        className={`w-full rounded-md border px-3 py-2 pr-9 font-sans text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
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

                            <div>
                                <label htmlFor="confirmPassword" className="block font-sans text-label text-neutral-700 mb-1">
                                    Confirmar contraseña
                                </label>
                                <div className="relative">
                                    <input
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={form.confirmPassword}
                                        onChange={handleChange}
                                        aria-invalid={Boolean(errors.confirmPassword)}
                                        aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
                                        className={`w-full rounded-md border px-3 py-2 pr-9 font-sans text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                                            errors.confirmPassword ? 'border-danger' : 'border-neutral-200'
                                        }`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword((v) => !v)}
                                        aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
                                    >
                                        <EyeIcon open={showConfirmPassword} />
                                    </button>
                                </div>
                                {errors.confirmPassword && (
                                    <p id="confirmPassword-error" role="alert" className="mt-1 text-caption text-danger">
                                        {errors.confirmPassword}
                                    </p>
                                )}
                            </div>
                        </div>

                        {!errors.password && !errors.confirmPassword && (
                            <p id="password-hint" className="text-caption text-neutral-500">
                                Mínimo 8 caracteres, una mayúscula, un número y un carácter especial.
                            </p>
                        )}

                        <div>
                            <label htmlFor="phone" className="block font-sans text-label text-neutral-700 mb-1">
                                Teléfono
                            </label>
                            <input
                                id="phone"
                                name="phone"
                                type="tel"
                                placeholder="300 123 4567"
                                value={form.phone}
                                onChange={handleChange}
                                aria-invalid={Boolean(errors.phone)}
                                aria-describedby={errors.phone ? 'phone-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2 font-sans text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                                    errors.phone ? 'border-danger' : 'border-neutral-200'
                                }`}
                            />
                            {errors.phone && (
                                <p id="phone-error" role="alert" className="mt-1 text-caption text-danger">
                                    {errors.phone}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-md bg-parkea-600 text-white font-sans font-medium py-2 hover:bg-parkea-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-parkea-600 transition disabled:opacity-60"
                        >
                            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                        </button>

                        <p className="text-center text-body text-neutral-600">
                            ¿Ya tienes cuenta?{' '}
                            <Link to="/login" className="text-parkea-600 font-medium underline hover:text-parkea-700">
                                Inicia sesión
                            </Link>
                        </p>
                    </form>
                </div>
                {/* Columna decorativa — se oculta en móvil (AC-04) */}
                <div className="hidden md:flex md:w-[380px] flex-col items-center justify-center gap-4 bg-parkea-50 p-6 text-center">
                    <img src={carImage} alt="" className="w-full max-w-[280px] object-contain" />
                    <h2 className="font-display text-subtitle text-neutral-900">
                        Reserva tu espacio al instante
                    </h2>
                    <p className="font-sans text-caption text-neutral-600">
                        Evita vueltas innecesarias, asegura tu parqueadero antes de salir de casa y paga de forma digital.
                    </p>
                    <div className="flex gap-2">
                        <span className="text-caption text-parkea-700 bg-parkea-100 rounded-full px-3 py-1">100% Seguro</span>
                        <span className="text-caption text-parkea-700 bg-parkea-100 rounded-full px-3 py-1">Acceso Rápido</span>
                    </div>
                </div>
            </div>
        </div>
    );
}