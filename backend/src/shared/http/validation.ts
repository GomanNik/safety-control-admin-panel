// =====================
// File: backend/src/shared/http/validation.ts
// Purpose:
// - Shared zod-based validation helpers for backend routes
// - Throws AppError instead of writing responses directly
// - Keeps route handlers compact and uniform
// =====================

import type { ZodTypeAny } from 'zod';

import { validationError } from '../errors';

function toPathString(
    path: ReadonlyArray<string | number>,
): string {
    if (path.length === 0) {
        return '';
    }

    return path
        .map((segment) => String(segment))
        .join('.');
}

function buildZodErrorDetails(
    error: import('zod').ZodError,
): Record<string, unknown> {
    const flattened = error.flatten();

    return {
        formErrors: flattened.formErrors,
        fieldErrors: flattened.fieldErrors,
        issues: error.issues.map((issue) => ({
            code: issue.code,
            path: toPathString(issue.path),
            message: issue.message,
        })),
    };
}

export function parseWithSchema<TSchema extends ZodTypeAny>(
    schema: TSchema,
    input: unknown,
    message: string = 'Request validation failed',
): ReturnType<TSchema['parse']> {
    const result = schema.safeParse(input);

    if (result.success) {
        return result.data;
    }

    throw validationError(
        message,
        buildZodErrorDetails(result.error),
    );
}