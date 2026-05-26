// =====================
// File: backend/src/shared/http/error-middleware.ts
// Purpose:
// - Shared express not-found and error middleware
// - Serializes backend errors to stable frontend-compatible payloads
// =====================

import type {
    ErrorRequestHandler,
    RequestHandler,
} from 'express';

import {
    notFound,
    toAppError,
} from '../errors';
import { toApiErrorResponseBody } from './api-response';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
    next(notFound(
        'NOT_FOUND',
        `Route ${req.method} ${req.originalUrl} not found`,
    ));
};

export const errorHandler: ErrorRequestHandler = (
    error,
    req,
    res,
    _next,
) => {
    if (res.headersSent) {
        return;
    }

    const appError = toAppError(error);

    if (appError.status >= 500) {
        console.error('[backend] unhandled request error', {
            method: req.method,
            url: req.originalUrl,
            code: appError.code,
            cause: appError.cause ?? error,
        });
    }

    res
        .status(appError.status)
        .json(toApiErrorResponseBody(appError));
};