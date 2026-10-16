import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

export default function AdminZones() {
    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-title font-display uppercase text-neutral-900">GestiÃ³n de zonas</h1>
                    <p className="mt-1 text-body text-neutral-600">Administra las zonas de parqueo registradas en el sistema.</p>
                </div>
                {/* AC-04: opens the creation form (HU-20) */}
                <Link
                    to="/admin/zones/new"
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label font-medium text-white transition-colors hover:bg-parkea-700 sm:w-auto"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Crear zona
                </Link>
            </div>
        </div>
    );
}