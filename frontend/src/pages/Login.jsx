import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isValidEmail, isNotEmpty } from '../utils/validators';
import { login } from '../services/authService';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const [form, setForm] = useState({ email: '', password: '' });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);

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
            const { data } = await login(form);
            loginUser(data.token, data.user);
            navigate('/dashboard');
        } catch (err) {
            const message = err.response?.data?.message || 'No se pudo iniciar sesión. Intenta de nuevo.';
            setServerError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-parkea-bg p-6">
            <form
                onSubmit={handleSubmit}
                noValidate
                className="w-full max-w-sm bg-white rounded-xl shadow-md p-8 space-y-5"
            >
                <h1 className="text-2xl font-bold text-parkea-gray text-center">
                    Iniciar sesión
                </h1>

                {serverError && (
                    <p role="alert" className="text-sm text-parkea-red text-center">
                        {serverError}
                    </p>
                )}

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-parkea-gray mb-1">
                        Correo electrónico
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'email-error' : undefined}
                        className={`w-full rounded-md border px-3 py-2 text-parkea-gray focus:outline-none focus:ring-2 focus:ring-parkea-green ${
                            errors.email ? 'border-parkea-red' : 'border-gray-300'
                        }`}
                    />
                    {errors.email && (
                        <p id="email-error" role="alert" className="mt-1 text-sm text-parkea-red">
                            {errors.email}
                        </p>
                    )}
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-parkea-gray mb-1">
                        Contraseña
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={errors.password ? 'password-error' : undefined}
                        className={`w-full rounded-md border px-3 py-2 text-parkea-gray focus:outline-none focus:ring-2 focus:ring-parkea-green ${
                            errors.password ? 'border-parkea-red' : 'border-gray-300'
                        }`}
                    />
                    {errors.password && (
                        <p id="password-error" role="alert" className="mt-1 text-sm text-parkea-red">
                            {errors.password}
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-parkea-green text-white font-semibold py-2 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-parkea-green transition disabled:opacity-60"
                >
                    {loading ? 'Ingresando...' : 'Iniciar sesión'}
                </button>
            </form>
        </div>
    );
}