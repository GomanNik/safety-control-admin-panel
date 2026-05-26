// =====================
// File: backend/src/shared/utils/normalize.ts
// Purpose:
// - Common normalization helpers used across backend modules
// - Keeps repeated text/array/object cleanup in one place
// =====================

export const isRecord = (
    value: unknown,
): value is Record<string, unknown> => (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
);

export function normalizeOptionalText(
    value: unknown,
): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const normalized = String(value).trim();

    return normalized.length > 0
        ? normalized
        : undefined;
}

export function normalizeNullableText(
    value: unknown,
): string | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const normalized = String(value).trim();

    return normalized.length > 0
        ? normalized
        : null;
}

export function normalizeStringArray(
    value: unknown,
): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const items = Array.from(
        new Set(
            value
                .map((item) => String(item).trim())
                .filter(Boolean),
        ),
    ).sort((left, right) => left.localeCompare(right));

    return items.length > 0
        ? items
        : undefined;
}

export function normalizeRecord(
    value: unknown,
): Record<string, unknown> | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    if (!isRecord(value)) {
        return null;
    }

    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function toFiniteNumber(
    value: unknown,
    fallback: number = 0,
): number {
    const parsed = Number(value);

    return Number.isFinite(parsed)
        ? parsed
        : fallback;
}