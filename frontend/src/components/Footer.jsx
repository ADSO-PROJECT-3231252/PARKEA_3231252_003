import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Footer() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const year = new Date().getFullYear();

    return (
        <div className="border-t border-neutral-200 bg-white">
            <div className="mx-auto flex w-[92%] max-w-[1800px] flex-col items-center gap-2 px-4 py-4 text-center text-caption text-neutral-600 sm:px-6 md:flex-row md:justify-between md:text-left">
                <p>
                    PARKEA © {year} · Sistema de Reservas de Parqueo Urbano · Dosquebradas, Risaralda - Colombia
                </p>
                {isAdmin && (
                    <p className="flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Acceso exclusivo para administradores
                    </p>
                )}
            </div>
        </div>
    );
}
