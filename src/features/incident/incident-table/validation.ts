// =====================
// features/incident/incident-table/validation.ts
// =====================

import type { Incident } from '../../../entities/incident';

/**
 * Canonical id type used by selection helpers.
 */
export type IncidentTableSelectedId = Incident['id'];

export function normalizeIncidentTableRowId(
    value: unknown,
): IncidentTableSelectedId | null {
    if (value == null) {
        return null;
    }

    const normalized = String(value).trim();

    if (!normalized) {
        return null;
    }

    return normalized as IncidentTableSelectedId;
}

export function normalizeIncidentTableSelectedIds(
    value?: readonly IncidentTableSelectedId[] | null,
): IncidentTableSelectedId[] {
    if (!Array.isArray(value) || value.length === 0) {
        return [];
    }

    const seen = new Set<string>();
    const result: IncidentTableSelectedId[] = [];

    for (const item of value) {
        const normalized = normalizeIncidentTableRowId(item);

        if (!normalized) {
            continue;
        }

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        result.push(normalized);
    }

    return result;
}