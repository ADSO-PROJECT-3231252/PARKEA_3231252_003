// One field of the zone form (HU-20, HU-21): label, input and one line under
// it, the hint or the error in its place. The input gets aria-describedby
// with whichever line is showing. Shared by ZoneFormFields and, for the
// spots and the rate of each vehicle type (HU-31), VehicleTypeFields.
export default function ZoneField({ id, label, hint, error, children }) {
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
    return (
        <div>
            <label htmlFor={id} className="block text-label text-neutral-900">
                {label} <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <div className="mt-1">{children({ 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}</div>
            {error ? (
                <p id={`${id}-error`} role="alert" className="mt-1 text-caption text-danger">
                    {error}
                </p>
            ) : (
                hint && (
                    <p id={`${id}-hint`} className="mt-1 text-caption text-neutral-600">
                        {hint}
                    </p>
                )
            )}
        </div>
    );
}
