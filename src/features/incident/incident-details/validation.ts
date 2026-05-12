// =====================
// features/incident/incident-details/validation.ts
// =====================

import type { Incident } from '../../../entities/incident';

export const EMPTY_INCIDENT_DETAILS_ID =
    '__incident_details_empty__' as Incident['id'];

export function normalizeIncidentDetailsId(
    value: unknown,
): Incident['id'] | null {
    if (value == null) {
        return null;
    }

    const normalized = String(value).trim();

    if (!normalized) {
        return null;
    }

    return normalized as Incident['id'];
}