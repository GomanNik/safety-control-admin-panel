// =====================
// File: src/shared/date/parse.ts
// Purpose:
// - Safe ISO date parsing helpers
// - Safe ISO date serialization helpers
// - Shared date normalization utilities used across entities/features
// =====================

/**
 * Парсим ISO-дату в Date.
 * Возвращаем Invalid Date (new Date(NaN)), если значение пустое или битое.
 */
export function parseIsoDateOrInvalid(
    value: string | null | undefined,
): Date {
    if (!value) {
        return new Date(NaN);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(NaN) : date;
}

/**
 * Парсим ISO-дату в Date | undefined.
 * Возвращаем undefined, если значение пустое или битое.
 */
export function parseOptionalIsoDate(
    value: string | null | undefined,
): Date | undefined {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Безопасно сериализуем дату в ISO-строку.
 * Если дата null/undefined/Invalid — возвращаем null.
 */
export function serializeDateOrNull(
    value: Date | null | undefined,
): string | null {
    if (!value) {
        return null;
    }

    if (Number.isNaN(value.getTime())) {
        return null;
    }

    return value.toISOString();
}

/**
 * Безопасно сериализуем дату в ISO-строку.
 * Если дата null/undefined/Invalid — возвращаем undefined.
 */
export function serializeDateOrUndefined(
    value: Date | null | undefined,
): string | undefined {
    const result = serializeDateOrNull(value);
    return result === null ? undefined : result;
}