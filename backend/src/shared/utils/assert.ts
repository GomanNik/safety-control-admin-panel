// =====================
// File: backend/src/shared/utils/assert.ts
// Purpose:
// - Small assertion helpers for backend shared/domain code
// =====================

export function hasOwnKey(
    value: object,
    key: string,
): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}