import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { isNotEmpty } from '../utils/validators';
import { resetPassword } from '../services/authService';
import { translateError } from '../utils/errorMessages';
import logo from '../assets/logo.png';
const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;
export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const [form, setForm] = useState({ newPassword: '', confirmNewPassword: '' });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [tokenInvalid, setTokenInvalid] = useState(false);
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
        if (serverError) setServerError('');
    };
    const validate = () => {
        const newErrors = {};
        if (!isNotEmpty(form.newPassword)) {
            newErrors.newPassword = 'La nueva contraseña es obligatoria.';
        } else if (!PASSWORD_RULE.test(form.newPassword)) {
            newErrors.newPassword =
                'Entre 8 y 20 caracteres, con una mayúscula, un número y un carácter especial.';
        }
        if (!isNotEmpty(form.confirmNewPassword)) {
            newErrors.confirmNewPassword = 'Confirma tu nueva contraseña.';
        } else if (form.newPassword !== form.confirmNewPassword) {
            newErrors.confirmNewPassword = 'Las contraseñas no coinciden.';
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
            await resetPassword({
                token,
                newPassword: form.newPassword,
                confirmNewPassword: form.confirmNewPassword,
            });
            navigate('/login', { state: { passwordReset: true } });
        } catch (err) {
            const code = err.response?.data?.code;
            // AC-09: a token the server rejects (invalid, used or expired)
            // gets the same dedicated screen as a missing token, with the
            // link back to phase 1.
            if (code === 'RESET_TOKEN_INVALID') {
                setTokenInvalid(true);
            } else {
                setServerError(translateError(code));
            }
        } finally {
            setLoading(false);
        }
    };
    // AC-09: no token in the URL, or a token the server rejected, shows
    // the message with the link back to phase 1.
    if (!token || tokenInvalid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-10">
                <div
                    className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-neutral-200
p-8 text-center"
                >
                    <p
                        role="alert"
                        className="text-caption text-danger bg-danger-soft rounded-md px-3 py-2 mb-4"
                    >
                        {translateError('RESET_TOKEN_INVALID')}
                    </p>
                    <Link
                        to="/forgot-password"
                        className="text-caption text-parkea-600 underline hover:text-parkea-700"
                    >
                        Solicitar nuevo enlace
                    </Link>
                </div>
            </div>
        );
    }
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
                        Crear nueva contraseña
                    </h1>
                </div>
                <div className="flex items-center gap-3 my-4">
                    <div className="h-px flex-1 bg-neutral-200" />
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-parkea-50">
                        <Lock className="h-4 w-4 text-parkea-600" aria-hidden="true" />
                    </span>
                    <div className="h-px flex-1 bg-neutral-200" />
                </div>
                <p className="font-sans text-body text-neutral-600 text-center mb-4">
                    Ingresa tu nueva contraseña para recuperar el acceso a tu cuenta.
                </p>
                {serverError && (
                    <p
                        role="alert"
                        className="mb-4 text-caption text-danger bg-danger-soft rounded-md px-3 py-2 text-center"
                    >
                        {serverError}
                    </p>
                )}
                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div>
                        <label
                            htmlFor="newPassword"
                            className="block font-sans text-label text-neutral-700 mb-1"
                        >
                            Nueva contraseña
                        </label>
                        <div className="relative">
                            <input
                                id="newPassword"
                                name="newPassword"
                                type={showPassword ? 'text' : 'password'}
                                maxLength={20}
                                placeholder="Ingresa tu nueva contraseña"
                                value={form.newPassword}
                                onChange={handleChange}
                                aria-invalid={Boolean(errors.newPassword)}
                                aria-describedby={
                                    errors.newPassword ? 'newPassword-error' : 'newPassword-hint'
                                }
                                className={`w-full rounded-md border px-3 py-2.5 pr-9 font-sans text-body
text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600
${errors.newPassword ? 'border-danger' : 'border-neutral-200'}`}
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
                        {errors.newPassword ? (
                            <p id="newPassword-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.newPassword}
                            </p>
                        ) : (
                            <p id="newPassword-hint" className="mt-1 text-caption text-neutral-500">
                                Entre 8 y 20 caracteres, con una mayúscula, un número y un carácter especial.
                            </p>
                        )}
                    </div>
                    <div>
                        <label
                            htmlFor="confirmNewPassword"
                            className="block font-sans text-label text-neutral-700 mb-1"
                        >
                            Confirmar nueva contraseña
                        </label>
                        <div className="relative">
                            <input
                                id="confirmNewPassword"
                                name="confirmNewPassword"
                                type={showConfirm ? 'text' : 'password'}
                                maxLength={20}
                                placeholder="Confirma tu nueva contraseña"
                                value={form.confirmNewPassword}
                                onChange={handleChange}
                                aria-invalid={Boolean(errors.confirmNewPassword)}
                                aria-describedby={
                                    errors.confirmNewPassword ? 'confirmNewPassword-error' : undefined
                                }
                                className={`w-full rounded-md border px-3 py-2.5 pr-9 font-sans text-body
text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600
${errors.confirmNewPassword ? 'border-danger' : 'border-neutral-200'}`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500
hover:text-neutral-700"
                            >
                                {showConfirm ? (
                                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                    <Eye className="h-4 w-4" aria-hidden="true" />
                                )}
                            </button>
                        </div>
                        {errors.confirmNewPassword && (
                            <p
                                id="confirmNewPassword-error"
                                role="alert"
                                className="mt-1 text-caption text-danger"
                            >
                                {errors.confirmNewPassword}
                            </p>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-md bg-parkea-600 text-white font-sans font-medium py-2.5
hover:bg-parkea-700 focus:outline-none focus:ring-2 focus:ring-offset-2
focus:ring-parkea-600 transition disabled:opacity-60"
                    >
                        {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
                    </button>
                </form>
                <div className="flex items-center gap-3 mt-4">
                    <div className="h-px flex-1 bg-neutral-200" />
                    <span className="w-1.5 h-1.5 rounded-full bg-parkea-600" />
                    <div className="h-px flex-1 bg-neutral-200" />
                </div>
            </div>
        </div>
    );
}
