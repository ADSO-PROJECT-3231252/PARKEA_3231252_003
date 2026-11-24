import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { spotsForHoursMessage } from '../utils/spotsForHours';

const TONES = {
    idle: { Icon: Info, className: 'text-neutral-600' },
    waiting: { Icon: Loader2, className: 'text-neutral-600', spin: true },
    room: { Icon: CheckCircle2, className: 'text-parkea-700' },
    full: { Icon: AlertCircle, className: 'text-warning' },
    error: { Icon: AlertCircle, className: 'text-neutral-600' },
};

// #375: the line under the hours of the reserve screen that says whether
// there is room for them (the texts are in utils/spotsForHours.js). It is
// always there, so a screen reader reads each new answer (role="status"),
// and the form does not jump when it changes. It only informs: the button
// stays enabled and the API still decides.
export default function SpotsForHours({ spots, openEnded, className = '' }) {
    const { tone, text } = spotsForHoursMessage(spots, openEnded);
    const { Icon, className: color, spin } = TONES[tone];
    return (
        <p role="status" className={`flex items-start gap-1.5 text-caption ${color} ${className}`}>
            <Icon
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${spin ? 'motion-safe:animate-spin' : ''}`}
                aria-hidden="true"
            />
            <span>{text}</span>
        </p>
    );
}
