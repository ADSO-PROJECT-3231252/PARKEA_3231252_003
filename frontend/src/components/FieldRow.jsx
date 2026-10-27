// One row of a vehicle form: a round icon on the left and the field (label,
// input and messages) on the right. Shared by RegisterVehicle and EditVehicle.
export default function FieldRow({ icon: Icon, children }) {
    return (
        <div className="flex items-start gap-4">
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1">{children}</div>
        </div>
    );
} 
