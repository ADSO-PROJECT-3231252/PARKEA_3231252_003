// Reusable summary tile for the admin dashboard (HU-22, AC-04).
export default function MetricCard({ icon: Icon, label, value, sublabel }) {
    return (
        <div className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-5">
            <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full
 bg-parkea-50 text-parkea-600`}
            >
                <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-label text-neutral-600">{label}</p>
                <p className="text-title font-display text-neutral-900">{value}</p>
                {sublabel && <p className="text-caption text-neutral-500">{sublabel}</p>}
            </div>
        </div>
    );
}