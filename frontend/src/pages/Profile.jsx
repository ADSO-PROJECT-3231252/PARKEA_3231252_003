import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, Info, Calendar } from 'lucide-react';
import { isNotEmpty } from '../utils/validators';
import { getProfile, updateProfile, changePassword } from '../services/userService';
import { translateError } from '../utils/errorMessages';
import { useAuth } from '../hooks/useAuth';

const DOCUMENT_LABELS = {
    CC: 'Cédula de ciudadanía',
    TI: 'Tarjeta de identidad',
    CE: 'Cédula de extranjería',
    PASSPORT: 'Pasaporte',
};

function getInitials(fullName = '') {
    return fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');
}

export default function Profile() {
    const { user, updateUser } = useAuth();

    const [profile, setProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    const [form, setForm] = useState({ fullName: '', phone: '' });
    const [profileErrors, setProfileErrors] = useState({});
    const [profileServerError, setProfileServerError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
    const [pwErrors, setPwErrors] = useState({});
    const [pwServerError, setPwServerError] = useState('');
    const [pwSuccess, setPwSuccess] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        let active = true;
        getProfile()
            .then(({ data }) => {
                if (!active) return;
                setProfile(data.user);
                setForm({ fullName: data.user.fullName || '', phone: data.user.phone || '' });
            })
            .finally(() => active && setLoadingProfile(false));
        return () => {
            active = false;
        };
    }, []);

    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const validateProfile = () => {
        const errors = {};
        if (!isNotEmpty(form.fullName)) {
            errors.fullName = 'El nombre completo es obligatorio.';
        }
        if (!isNotEmpty(form.phone)) {
            errors.phone = 'El teléfono es obligatorio.';
        } else if (!/^[0-9]{7,15}$/.test(form.phone)) {
            errors.phone = 'El teléfono debe contener solo números (7 a 15 dígitos).';
        }
        setProfileErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setProfileServerError('');
        setProfileSuccess('');
        if (!validateProfile()) return;

        setSavingProfile(true);
        try {
            const { data } = await updateProfile({ fullName: form.fullName, phone: form.phone });
            setProfile((prev) => ({ ...prev, ...data.user }));
            updateUser({ fullName: data.user.fullName, phone: data.user.phone });
            setProfileSuccess('Perfil actualizado correctamente.');
        } catch (err) {
            setProfileServerError(translateError(err.response?.data?.code));
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePwChange = (e) => {
        const { name, value } = e.target;
        setPwForm((prev) => ({ ...prev, [name]: value }));
    };

    const validatePassword = () => {
        const errors = {};
        if (!isNotEmpty(pwForm.currentPassword)) {
            errors.currentPassword = 'La contraseña actual es obligatoria.';
        }
        if (!isNotEmpty(pwForm.newPassword)) {
            errors.newPassword = 'La nueva contraseña es obligatoria.';
        } else if (
            pwForm.newPassword.length < 8 ||
            pwForm.newPassword.length > 20 ||
            !/[A-Z]/.test(pwForm.newPassword) ||
            !/[0-9]/.test(pwForm.newPassword) ||
            !/[^A-Za-z0-9]/.test(pwForm.newPassword)
        ) {
            errors.newPassword = 'Entre 8 y 20 caracteres, con una mayúscula, un número y un carácter especial.';
        }
        if (!isNotEmpty(pwForm.confirmNewPassword)) {
            errors.confirmNewPassword = 'Confirma tu nueva contraseña.';
        } else if (pwForm.newPassword !== pwForm.confirmNewPassword) {
            errors.confirmNewPassword = 'Las contraseñas no coinciden.';
        }
        setPwErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSavePassword = async (e) => {
        e.preventDefault();
        setPwServerError('');
        setPwSuccess('');
        if (!validatePassword()) return;

        setSavingPassword(true);
        try {
            await changePassword(pwForm);
            setPwSuccess('Contraseña actualizada correctamente.');
            setPwForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'CURRENT_PASSWORD_INCORRECT') {
                setPwErrors((prev) => ({ ...prev, currentPassword: translateError(code) }));
            } else if (code === 'PASSWORD_UNCHANGED') {
                setPwErrors((prev) => ({ ...prev, newPassword: translateError(code) }));
            } else {
                setPwServerError(translateError(code));
            }
        } finally {
            setSavingPassword(false);
        }
    };

    if (loadingProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50">
                <p className="text-body text-neutral-600">Cargando perfil...</p>
            </div>
        );
    }

    const memberSince = profile?.createdAt
        ? new Date(profile.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    return (
        <div className="min-h-screen bg-neutral-50 px-4 py-8">
            <div className="max-w-4xl mx-auto">

                <h1 className="font-display text-title text-neutral-900 uppercase">Mi perfil</h1>
                <p className="font-sans text-body text-neutral-600 mb-6">
                    Consulta y actualiza tu información personal.
                </p>

                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 mb-6 grid grid-cols-1 md:grid-cols-[auto_1fr_1fr] gap-6">

                    <div className="flex flex-col items-center text-center md:w-40">
                        <div className="w-20 h-20 rounded-full bg-parkea-600 text-white flex items-center justify-center font-display text-title">
                            {getInitials(profile?.fullName)}
                        </div>
                        <p className="font-sans font-medium text-body text-neutral-900 mt-3">
                            {profile?.fullName}
                        </p>
                        {memberSince && (
                            <p className="flex items-center gap-1 text-caption text-neutral-500 mt-3">
                                <Calendar size={13} />
                                Miembro desde {memberSince}
                            </p>
                        )}
                    </div>

                    <form onSubmit={handleSaveProfile} noValidate className="space-y-4">
                        <div className="flex items-center gap-2 text-label font-medium text-neutral-700">
                            <User size={15} />
                            Información personal
                        </div>

                        {profileServerError && (
                            <p role="alert" className="text-caption text-danger bg-danger-soft rounded-md px-3 py-2">
                                {profileServerError}
                            </p>
                        )}
                        {profileSuccess && (
                            <p role="status" className="text-caption text-parkea-700 bg-parkea-50 rounded-md px-3 py-2">
                                {profileSuccess}
                            </p>
                        )}

                        <div>
                            <label htmlFor="fullName" className="block text-label text-neutral-700 mb-1">
                                Nombre completo
                            </label>
                            <input
                                id="fullName"
                                name="fullName"
                                type="text"
                                value={form.fullName}
                                onChange={handleProfileChange}
                                aria-invalid={Boolean(profileErrors.fullName)}
                                aria-describedby={profileErrors.fullName ? 'fullName-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${profileErrors.fullName ? 'border-danger' : 'border-neutral-200'
                                    }`}
                            />
                            {profileErrors.fullName && (
                                <p id="fullName-error" role="alert" className="mt-1 text-caption text-danger">
                                    {profileErrors.fullName}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="phone" className="block text-label text-neutral-700 mb-1">
                                Teléfono
                            </label>
                            <input
                                id="phone"
                                name="phone"
                                type="tel"
                                value={form.phone}
                                onChange={handleProfileChange}
                                aria-invalid={Boolean(profileErrors.phone)}
                                aria-describedby={profileErrors.phone ? 'phone-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${profileErrors.phone ? 'border-danger' : 'border-neutral-200'
                                    }`}
                            />
                            {profileErrors.phone && (
                                <p id="phone-error" role="alert" className="mt-1 text-caption text-danger">
                                    {profileErrors.phone}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={savingProfile}
                            className="hidden md:inline-block rounded-md bg-parkea-600 text-white text-label font-medium px-4 py-2 hover:bg-parkea-700 disabled:opacity-60"
                        >
                            {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </form>

                    <div className="bg-parkea-50 rounded-md p-4 space-y-3 h-fit">
                        <div className="flex items-center gap-2 text-label font-medium text-parkea-700">
                            <Lock size={15} />
                            Información no editable
                        </div>

                        <div>
                            <p className="text-label text-neutral-700 mb-1">Correo electrónico</p>
                            <p className="text-body text-neutral-600 bg-neutral-100 rounded-md px-3 py-2">{profile?.email}</p>
                        </div>
                        <div>
                            <p className="text-label text-neutral-700 mb-1">Tipo de documento</p>
                            <p className="text-body text-neutral-600 bg-neutral-100 rounded-md px-3 py-2">
                                {DOCUMENT_LABELS[profile?.documentType] || profile?.documentType}
                            </p>
                        </div>
                        <div>
                            <p className="text-label text-neutral-700 mb-1">Número de documento</p>
                            <p className="text-body text-neutral-600 bg-neutral-100 rounded-md px-3 py-2">{profile?.documentNumber}</p>
                        </div>

                        <p className="flex items-start gap-1.5 text-caption text-neutral-500">
                            <Info size={13} className="mt-0.5 shrink-0" />
                            Por seguridad, esta información no se puede editar.
                        </p>
                    </div>

                    <button
                        type="submit"
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className="md:hidden w-full rounded-md bg-parkea-600 text-white text-label font-medium px-4 py-2 hover:bg-parkea-700 disabled:opacity-60"
                    >
                        {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </div>

                <form onSubmit={handleSavePassword} noValidate className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 space-y-4">
                    <div className="flex items-center gap-2 text-label font-medium text-neutral-700">
                        <Lock size={15} />
                        Cambiar contraseña
                    </div>
                    <p className="text-caption text-neutral-500 -mt-2">
                        Asegúrate de usar una contraseña segura que solo tú conozcas.
                    </p>

                    {pwServerError && (
                        <p role="alert" className="text-caption text-danger bg-danger-soft rounded-md px-3 py-2">
                            {pwServerError}
                        </p>
                    )}
                    {pwSuccess && (
                        <p role="status" className="text-caption text-parkea-700 bg-parkea-50 rounded-md px-3 py-2">
                            {pwSuccess}
                        </p>
                    )}

                    <div>
                        <label htmlFor="currentPassword" className="block text-label text-neutral-700 mb-1">
                            Contraseña actual
                        </label>
                        <div className="relative">
                            <input
                                id="currentPassword"
                                name="currentPassword"
                                type={showCurrent ? 'text' : 'password'}
                                placeholder="Ingresa tu contraseña actual"
                                value={pwForm.currentPassword}
                                onChange={handlePwChange}
                                aria-invalid={Boolean(pwErrors.currentPassword)}
                                aria-describedby={pwErrors.currentPassword ? 'currentPassword-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${pwErrors.currentPassword ? 'border-danger' : 'border-neutral-200'
                                    }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent((v) => !v)}
                                aria-label={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
                            >
                                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {pwErrors.currentPassword && (
                            <p id="currentPassword-error" role="alert" className="mt-1 text-caption text-danger">
                                {pwErrors.currentPassword}
                            </p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="newPassword" className="block text-label text-neutral-700 mb-1">
                            Nueva contraseña
                        </label>
                        <div className="relative">
                            <input
                                id="newPassword"
                                name="newPassword"
                                type={showNew ? 'text' : 'password'}
                                maxLength={20}
                                placeholder="Ingresa tu nueva contraseña"
                                value={pwForm.newPassword}
                                onChange={handlePwChange}
                                aria-invalid={Boolean(pwErrors.newPassword)}
                                aria-describedby={pwErrors.newPassword ? 'newPassword-error' : 'newPassword-hint'}
                                className={`w-full rounded-md border px-3 py-2 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${pwErrors.newPassword ? 'border-danger' : 'border-neutral-200'
                                    }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew((v) => !v)}
                                aria-label={showNew ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
                            >
                                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {pwErrors.newPassword ? (
                            <p id="newPassword-error" role="alert" className="mt-1 text-caption text-danger">
                                {pwErrors.newPassword}
                            </p>
                        ) : (
                            <p id="newPassword-hint" className="mt-1 text-caption text-neutral-500">
                                Entre 8 y 20 caracteres, con una mayúscula, un número y un carácter especial.
                            </p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="confirmNewPassword" className="block text-label text-neutral-700 mb-1">
                            Confirmar nueva contraseña
                        </label>
                        <div className="relative">
                            <input
                                id="confirmNewPassword"
                                name="confirmNewPassword"
                                type={showConfirm ? 'text' : 'password'}
                                maxLength={20}
                                placeholder="Confirma tu nueva contraseña"
                                value={pwForm.confirmNewPassword}
                                onChange={handlePwChange}
                                aria-invalid={Boolean(pwErrors.confirmNewPassword)}
                                aria-describedby={pwErrors.confirmNewPassword ? 'confirmNewPassword-error' : undefined}
                                className={`w-full rounded-md border px-3 py-2 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${pwErrors.confirmNewPassword ? 'border-danger' : 'border-neutral-200'
                                    }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
                            >
                                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {pwErrors.confirmNewPassword && (
                            <p id="confirmNewPassword-error" role="alert" className="mt-1 text-caption text-danger">
                                {pwErrors.confirmNewPassword}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={savingPassword}
                        className="w-full md:w-auto rounded-md bg-parkea-600 text-white text-label font-medium px-6 py-2.5 hover:bg-parkea-700 disabled:opacity-60"
                    >
                        {savingPassword ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </form>
            </div>
        </div>
    );
}