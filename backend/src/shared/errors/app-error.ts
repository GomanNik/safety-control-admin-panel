// =====================
// File: backend/src/shared/errors/app-error.ts
// Purpose:
// - Canonical backend application error
// - Keeps HTTP status, stable machine-readable code, and optional details
// - Produces response shape aligned with frontend ApiErrorPayload expectations
// =====================

interface AppErrorInit<TDetails = unknown> {
    code: string;
    message: string;
    status: number;
    details?: TDetails;
    expose?: boolean;
    cause?: unknown;
}

export class AppError<TDetails = unknown> extends Error {
    public readonly code: string;
    public readonly status: number;
    public readonly details?: TDetails;
    public readonly expose: boolean;
    public override readonly cause?: unknown;

    public constructor(init: AppErrorInit<TDetails>) {
        super(init.message);

        this.name = 'AppError';
        this.code = init.code;
        this.status = init.status;
        this.details = init.details;
        this.expose = init.expose ?? init.status < 500;
        this.cause = init.cause;
    }
}

const isRecord = (
    value: unknown,
): value is Record<string, unknown> => (
    typeof value === 'object' &&
    value !== null
);

function isAppError(
    error: unknown,
): error is AppError {
    if (error instanceof AppError) {
        return true;
    }

    if (!isRecord(error)) {
        return false;
    }

    return (
        typeof error.code === 'string' &&
        typeof error.message === 'string' &&
        typeof error.status === 'number'
    );
}

function createAppError<TDetails = unknown>(
    init: AppErrorInit<TDetails>,
): AppError<TDetails> {
    return new AppError(init);
}

export function forbidden<TDetails = unknown>(
    code: string,
    message: string,
    details?: TDetails,
): AppError<TDetails> {
    return createAppError({
        code,
        message,
        status: 403,
        details,
    });
}

export function notFound<TDetails = unknown>(
    code: string,
    message: string,
    details?: TDetails,
): AppError<TDetails> {
    return createAppError({
        code,
        message,
        status: 404,
        details,
    });
}

export function conflict<TDetails = unknown>(
    code: string,
    message: string,
    details?: TDetails,
): AppError<TDetails> {
    return createAppError({
        code,
        message,
        status: 409,
        details,
    });
}

export function validationError<TDetails = unknown>(
    message: string = 'Request validation failed',
    details?: TDetails,
): AppError<TDetails> {
    return createAppError({
        code: 'VALIDATION_ERROR',
        message,
        status: 400,
        details,
    });
}

function internalServerError<TDetails = unknown>(
    details?: TDetails,
    cause?: unknown,
): AppError<TDetails> {
    return createAppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        status: 500,
        details,
        expose: false,
        cause,
    });
}

export function toAppError(
    error: unknown,
): AppError {
    if (isAppError(error)) {
        return error;
    }

    if (error instanceof Error) {
        return internalServerError(undefined, error);
    }

    return internalServerError(undefined, error);
}