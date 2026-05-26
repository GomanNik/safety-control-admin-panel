// =====================
// File: backend/src/shared/errors/index.ts
// Purpose:
// - Public barrel for shared backend errors
// - Exports only members that are actually consumed by current backend code
// =====================

export {
    AppError,
    conflict,
    forbidden,
    notFound,
    toAppError,
    validationError,
} from './app-error';