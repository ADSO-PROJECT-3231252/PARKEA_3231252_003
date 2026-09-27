import { ShieldCheck, UserRound, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

export default function AdminLogin() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-10">
            <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-neutral-200
                overflow-hidden">

                <div className="bg-parkea-700 h-12 flex items-center justify-center">
                    <ShieldCheck size={18} color="white" />
                </div>

                <div className="p-8">
                    <div className="flex flex-col items-center mb-6">
                        <img src={logo} alt="PARKEA" className="h-12 w-auto object-contain" />
                        <p className="font-sans text-caption text-parkea-600 mt-1">
                            Reserva tu parqueo, simplifica tu día.
                        </p>
                    </div>

                    <div className="text-center">
                        <div className="flex items-center justify-center gap-2">
                            <UserRound size={20} className="text-neutral-900" />
                            <h1 className="font-display text-title text-neutral-900 uppercase">
                                Acceso administrador
                            </h1>
                        </div>
                        <p className="font-sans text-body text-neutral-600 mt-1">
                            Ingresa tus credenciales para acceder al panel administrativo.
                        </p>
                    </div>

                    <div className="text-center mt-6">
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-1 text-caption text-parkea-600 underline
                                hover:text-parkea-700"
                        >
                            <ArrowLeft size={14} />
                            Volver al inicio de sesión de usuario
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}