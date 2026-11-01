import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

// Thin separator between the footer items, only when they share a line.
function Separator() {
    return (
        <span className="hidden md:inline" aria-hidden="true">
            ·
        </span>
    );
}

export default function Footer() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const year = new Date().getFullYear();

    return (
        <div className="border-t border-neutral-200 bg-white">
            <div className="mx-auto flex w-[92%] max-w-[1800px] flex-col items-center gap-3 px-4 py-4 text-center text-caption text-neutral-600 sm:px-6 lg:flex-row lg:justify-between lg:text-left">
                {/* On phones the items stack centered and the separators are hidden. */}
                <p className="flex flex-col items-center gap-1 md:flex-row md:flex-wrap md:justify-center md:gap-x-2">
                    <span>PARKEA © {year}</span>
                    <Separator />
                    <span>Sistema de Reservas de Parqueo Urbano</span>
                    <Separator />
                    <span>Dosquebradas, Risaralda - Colombia</span>
                </p>
                {isAdmin && (
                    <p className="flex items-center gap-1.5 whitespace-nowrap">
                        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Acceso exclusivo para administradores
                    </p>
                )}
            </div>
        </div>
    );
}
