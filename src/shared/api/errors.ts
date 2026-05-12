// =====================
// shared/api/errors.ts
// =====================
import type { HttpRequestHeaders } from './types';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger()
    .child('shared')
    .child('api')
    .child('errors');

export enum HttpErrorCode {
    Network = 'network',
    Timeout = 'timeout',
    Aborted = 'aborted',

    Unauthorized = 'unauthorized',
    Forbidden = 'forbidden',
    NotFound = 'not_found',
    Conflict = 'conflict',
    TooManyRequests = 'too_many_requests',

    ServerError = 'server_error',
    ValidationError = 'validation_error',
    BadRequest = 'bad_request',
    Unknown = 'unknown',
}

export interface HttpErrorInit {
    message: string;
    status?: number;
    code?: HttpErrorCode;
    details?: unknown;
    url?: string;
    method?: string;
    responseHeaders?: HttpRequestHeaders;
}

export interface HttpErrorLike extends Error {
    status?: number;
    code: HttpErrorCode;
    details?: unknown;
    url?: string;
    method?: string;
    isCanceled?: boolean;
    responseHeaders?: HttpRequestHeaders;
}

export interface ApiErrorPayload {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface ApiErrorLike extends HttpErrorLike {
    payload?: ApiErrorPayload;
}

const ALL_ERROR_CODES: HttpErrorCode[] = [
    HttpErrorCode.Network,
    HttpErrorCode.Timeout,
    HttpErrorCode.Aborted,

    HttpErrorCode.Unauthorized,
    HttpErrorCode.Forbidden,
    HttpErrorCode.NotFound,
    HttpErrorCode.Conflict,
    HttpErrorCode.TooManyRequests,

    HttpErrorCode.ServerError,
    HttpErrorCode.ValidationError,
    HttpErrorCode.BadRequest,
    HttpErrorCode.Unknown,
];

const deriveCodeFromStatus = (status?: number): HttpErrorCode => {
    if (status == null) {
        return HttpErrorCode.Unknown;
    }

    if (status === 400) return HttpErrorCode.BadRequest;
    if (status === 401) return HttpErrorCode.Unauthorized;
    if (status === 403) return HttpErrorCode.Forbidden;
    if (status === 404) return HttpErrorCode.NotFound;
    if (status === 408) return HttpErrorCode.Timeout;
    if (status === 409) return HttpErrorCode.Conflict;
    if (status === 422) return HttpErrorCode.ValidationError;
    if (status === 429) return HttpErrorCode.TooManyRequests;
    if (status >= 500 && status <= 599) return HttpErrorCode.ServerError;

    return HttpErrorCode.Unknown;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null;

export const isAbortLikeError = (error: unknown): boolean => {
    const e: any = error;
    if (!e) return false;

    if (e?.code === HttpErrorCode.Aborted) return true;
    if (e?.isCanceled === true) return true;

    if (e?.name === 'AbortError') return true;
    if (e?.code === 'ABORT_ERR') return true;
    if (e?.code === 'ERR_CANCELED') return true;

    const msg = String(e?.message ?? '').toLowerCase();
    if (msg.includes('aborted')) return true;
    if (msg.includes('canceled')) return true;
    return msg.includes('cancelled');
};

export const createHttpError = (init: HttpErrorInit): HttpErrorLike => {
    const error = new Error(init.message) as HttpErrorLike;

    const code = init.code ?? deriveCodeFromStatus(init.status);

    error.name = 'HttpError';
    error.status = init.status;
    error.code = code;
    error.details = init.details;
    error.url = init.url;
    error.method = init.method;

    error.responseHeaders = init.responseHeaders;

    if (code === HttpErrorCode.Aborted) {
        error.name = 'AbortError';
        error.isCanceled = true;
    }

    logger.debug('HttpError created', {
        message: init.message,
        status: init.status,
        code: error.code,
        name: error.name,
        isCanceled: error.isCanceled === true,
        method: init.method,
        url: init.url,
    });

    return error;
};

export const isHttpError = (error: unknown): error is HttpErrorLike => {
    if (!isRecord(error)) {
        return false;
    }

    const anyError = error as {
        code?: unknown;
        message?: unknown;
    };

    if (typeof anyError.code !== 'string') {
        return false;
    }

    const code = anyError.code as HttpErrorCode;
    if (!ALL_ERROR_CODES.includes(code)) {
        return false;
    }

    return typeof anyError.message === 'string';
};

export const normalizeHttpError = (
    error: unknown,
    fallback?: Partial<HttpErrorInit> & { message?: string },
): HttpErrorLike => {
    if (isHttpError(error)) {
        return error;
    }

    const statusFromError =
        (isRecord(error) && typeof (error as any).status === 'number'
            ? (error as any).status
            : undefined) ??
        (isRecord(error) && typeof (error as any).statusCode === 'number'
            ? (error as any).statusCode
            : undefined) ??
        fallback?.status;

    const messageFromError =
        (typeof error === 'string' ? error : undefined) ??
        (isRecord(error) && typeof (error as any).message === 'string'
            ? (error as any).message
            : undefined) ??
        fallback?.message ??
        'Unknown HTTP error';

    const code =
        fallback?.code ??
        (isAbortLikeError(error)
            ? HttpErrorCode.Aborted
            : deriveCodeFromStatus(statusFromError));

    const responseHeaders =
        (isRecord(error) && isRecord((error as any).responseHeaders)
            ? ((error as any).responseHeaders as HttpRequestHeaders)
            : undefined) ??
        fallback?.responseHeaders;

    return createHttpError({
        message: messageFromError,
        status: statusFromError,
        code,
        details: fallback?.details ?? error,
        url:
            (isRecord(error) && typeof (error as any).url === 'string'
                ? (error as any).url
                : undefined) ?? fallback?.url,
        method:
            (isRecord(error) && typeof (error as any).method === 'string'
                ? (error as any).method
                : undefined) ?? fallback?.method,
        responseHeaders,
    });
};

export const isApiError = (error: unknown): error is ApiErrorLike => {
    if (!isHttpError(error)) {
        return false;
    }

    const anyError = error as ApiErrorLike;
    const payload = (anyError as any).payload as unknown;

    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const p = payload as { code?: unknown; message?: unknown };

    return typeof p.code === 'string' && typeof p.message === 'string';
};