// =====================
// File: backend/src/shared/utils/index.ts
// Purpose:
// - Public barrel for shared backend utils
// - Exports only helpers that are actually consumed by current backend code
// =====================

export { hasOwnKey } from './assert';
export {
    isRecord,
    normalizeNullableText,
    normalizeOptionalText,
    normalizeRecord,
    normalizeStringArray,
    toFiniteNumber,
} from './normalize';
export { buildPaginationMeta } from './pagination';