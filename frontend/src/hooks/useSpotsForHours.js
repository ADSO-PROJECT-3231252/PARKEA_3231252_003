import { useCallback, useEffect, useState } from 'react';
import { getAvailabilityForHours } from '../services/zoneService';

// #375: how long the screen waits after the last change of the hours before
// it asks, so typing a time does not send a request for every key
export const SPOTS_WAIT_MS = 500;

// AC-19 of HU-14: a reservation starts at most 48 hours ahead
const MAX_ADVANCE_MS = 48 * 60 * 60 * 1000;

// #375: how many spots of the zone are free for the hours of the form
// (GET /zones/:id/availability). HU-31: the spots of `vehicleType`, the type of
// the chosen vehicle (null while there is none, and then it does not ask).
// `hours` is null while the form has no valid
// hours, or { startTime, endTime } / { startTime, openEnded: true } with the
// same values that POST /reservations would get. It asks SPOTS_WAIT_MS after
// the last change, cancels a request whose hours changed meanwhile, and never
// asks for an entry that already passed or is more than 48 hours ahead (the
// form says why). The answer:
// - { state: 'idle' }: no valid hours to ask for.
// - { state: 'waiting' }: waiting for the pause or for the answer.
// - { state: 'done', availableSlots, hourlyRate, openEnded, vehicleType }:
//   hourlyRate is the rate of the type now, the one a reservation would keep
// - { state: 'error', code, hours }: the code of the API (null without one,
//   for example without network) and, for the hours of the zone, its hours.
// `refresh` asks again for the same hours (after the reservation answered
// that the room was taken meanwhile).
export function useSpotsForHours(zoneId, vehicleType, hours) {
    const key = hours && vehicleType
        ? JSON.stringify([zoneId, vehicleType, hours.startTime, hours.openEnded ? null : hours.endTime, Boolean(hours.openEnded)])
        : null;
    const [answer, setAnswer] = useState({ key: null });
    const [round, setRound] = useState(0);

    useEffect(() => {
        if (!key) return undefined;
        const [id, type, startTime, endTime, openEnded] = JSON.parse(key);
        const controller = new AbortController();
        const timer = setTimeout(() => {
            // An entry that passed while the form was open, or one too far
            // ahead, is not asked for: the API would only reject it
            const aheadMs = new Date(startTime).getTime() - Date.now();
            if (aheadMs <= 0 || aheadMs > MAX_ADVANCE_MS) {
                setAnswer({ key, result: { state: 'idle' } });
                return;
            }
            const params = openEnded ? { vehicleType: type, startTime, openEnded: true } : { vehicleType: type, startTime, endTime };
            getAvailabilityForHours(id, params, { signal: controller.signal })
                .then(({ data }) => setAnswer({ key, result: { state: 'done', availableSlots: data.availableSlots, hourlyRate: data.hourlyRate, openEnded, vehicleType: type } }))
                .catch((err) => {
                    // Cancelled because the hours changed: another request follows
                    if (controller.signal.aborted) return;
                    const data = err.response?.data;
                    setAnswer({ key, result: { state: 'error', code: data?.code ?? null, hours: data?.hours ?? null } });
                });
        }, SPOTS_WAIT_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [key, round]);

    const refresh = useCallback(() => setRound((n) => n + 1), []);

    if (!key) return { state: 'idle', refresh };
    // The answer of other hours (or none yet): the one for these is coming
    if (answer.key !== key) return { state: 'waiting', refresh };
    return { ...answer.result, refresh };
}
