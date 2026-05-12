// =====================
// File: backend/src/shared/http/api-response.ts
// Purpose:
// - Shared backend HTTP response contracts/helpers
// - Error payload shape stays aligned with frontend ApiErrorPayload
// =====================

import type { Response } from 'express';

import type { AppError } from '../errors';
import { isRecord } from '../utils';

interface ApiErrorResponseBody {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

function toErrorDetailsRecord(
    value: unknown,
): Record<string, unknown> | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (isRecord(value)) {
        return value;
    }

    if (Array.isArray(value)) {
        return {
            items: value,
        };
    }

    return {
        value,
    };
}

export function toApiErrorResponseBody(
    error: AppError,
): ApiErrorResponseBody {
    const details = error.expose
        ? toErrorDetailsRecord(error.details)
        : undefined;

    return {
        code: error.code,
        message: error.message,
        ...(details ? { details } : {}),
    };
}

export function sendNoContent(
    res: Response,
): void {
    res.status(204).send();
}