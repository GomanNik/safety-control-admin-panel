// =====================
// File: src/shared/api/http-client.ts
// Purpose:
// - Shared HTTP client
// - Fixed credentials behavior
// - Improved interceptor error normalization
// - Explicit fetch resolution
// =====================

import type {
    HttpMethod,
    HttpRequestConfig,
    HttpRequestHeaders,
    HttpRequestQuery,
    HttpResponse,
} from './types';
import {
    type ApiErrorLike,
    type ApiErrorPayload,
    createHttpError,
    HttpErrorCode,
    isAbortLikeError,
    isHttpError,
    normalizeHttpError,
    type HttpErrorLike,
} from './errors';
import {
    createHttpInterceptorManager,
    type HttpInterceptorManager,
    type InternalHttpInterceptorManager,
} from './interceptors';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger()
    .child('shared')
    .child('api')
    .child('http-client');

export interface HttpClientRequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
    headers?: HttpRequestHeaders;
}

export interface HttpRetryContext {
    readonly error: HttpErrorLike;
    /**
     * Номер попытки, начиная с 0.
     * 0 — первая попытка, 1 — первый ретрай и т.д.
     */
    readonly attempt: number;
    /**
     * Максимальное количество ретраев.
     */
    readonly maxRetries: number;
    /**
     * Исходный конфиг запроса.
     */
    readonly requestConfig: HttpRequestConfig<any, any>;
}

export interface HttpRetryPolicy {
    /**
     * Количество дополнительных попыток поверх первой.
     */
    maxRetries: number;
    /**
     * Базовая задержка перед повторной попыткой (мс).
     */
    baseDelayMs?: number;
    /**
     * Множитель экспоненциального роста задержки.
     */
    backoffMultiplier?: number;
    /**
     * Максимальная задержка между попытками (мс).
     */
    maxDelayMs?: number;
    /**
     * Кастомный предикат решения о ретрае.
     */
    shouldRetry?(context: HttpRetryContext): boolean;
}

export interface HttpClient {
    readonly interceptors: HttpInterceptorManager;

    request<
        TResponse = unknown,
        TBody = unknown,
        TQuery extends object = Record<string, unknown>,
    >(
        config: HttpRequestConfig<TBody, TQuery>,
    ): Promise<HttpResponse<TResponse>>;

    get<
        TResponse = unknown,
        TQuery extends object = Record<string, unknown>,
    >(
        url: string,
        config?: Omit<
            HttpRequestConfig<never, TQuery>,
            'url' | 'method' | 'body'
        >,
    ): Promise<HttpResponse<TResponse>>;

    post<
        TResponse = unknown,
        TBody = unknown,
        TQuery extends object = Record<string, unknown>,
    >(
        url: string,
        body?: TBody,
        config?: Omit<
            HttpRequestConfig<TBody, TQuery>,
            'url' | 'method' | 'body'
        >,
    ): Promise<HttpResponse<TResponse>>;

    put<
        TResponse = unknown,
        TBody = unknown,
        TQuery extends object = Record<string, unknown>,
    >(
        url: string,
        body?: TBody,
        config?: Omit<
            HttpRequestConfig<TBody, TQuery>,
            'url' | 'method' | 'body'
        >,
    ): Promise<HttpResponse<TResponse>>;

    patch<
        TResponse = unknown,
        TBody = unknown,
        TQuery extends object = Record<string, unknown>,
    >(
        url: string,
        body?: TBody,
        config?: Omit<
            HttpRequestConfig<TBody, TQuery>,
            'url' | 'method' | 'body'
        >,
    ): Promise<HttpResponse<TResponse>>;

    delete<
        TResponse = unknown,
        TQuery extends object = Record<string, unknown>,
    >(
        url: string,
        config?: Omit<
            HttpRequestConfig<never, TQuery>,
            'url' | 'method' | 'body'
        >,
    ): Promise<HttpResponse<TResponse>>;
}

export interface HttpClientFactoryOptions {
    baseUrl?: string;
    defaultHeaders?: HttpRequestHeaders;
    timeoutMs?: number;
    /**
     * Позволяет подменить реализацию fetch.
     */
    fetchFn?: typeof fetch;
    /**
     * Опциональная политика ретраев для всех запросов клиента.
     */
    retryPolicy?: HttpRetryPolicy;
}

const isAbsoluteUrl = (url: string): boolean => {
    return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
};

const joinUrls = (baseUrl: string, path: string): string => {
    const trimmedBase = baseUrl.replace(/\/+$/, '');
    const trimmedPath = path.replace(/^\/+/, '');

    if (!trimmedBase) {
        return `/${trimmedPath}`;
    }

    if (!trimmedPath) {
        return trimmedBase;
    }

    return `${trimmedBase}/${trimmedPath}`;
};

type QueryPrimitive = string | number | boolean;

type QueryValueRuntime =
    | QueryPrimitive
    | null
    | undefined
    | QueryPrimitive[]
    | Date
    | Date[]
    | Record<string, unknown>
    | Array<Record<string, unknown>>;

const appendQueryParam = (
    params: URLSearchParams,
    key: string,
    value: QueryValueRuntime,
): void => {
    if (value === undefined || value === null) {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            if (item === undefined || item === null) {
                continue;
            }

            if (item instanceof Date) {
                params.append(key, item.toISOString());
                continue;
            }

            const type = typeof item;

            if (
                type === 'string' ||
                type === 'number' ||
                type === 'boolean'
            ) {
                params.append(key, String(item));
                continue;
            }

            try {
                params.append(key, JSON.stringify(item));
            } catch {
                params.append(key, String(item));
            }
        }

        return;
    }

    if (value instanceof Date) {
        params.append(key, value.toISOString());
        return;
    }

    const type = typeof value;

    if (
        type === 'string' ||
        type === 'number' ||
        type === 'boolean'
    ) {
        params.append(key, String(value));
        return;
    }

    try {
        params.append(key, JSON.stringify(value));
    } catch {
        params.append(key, String(value));
    }
};

const buildUrl = (
    baseUrl: string | undefined,
    path: string,
    query?: HttpRequestQuery<any>,
): string => {
    let url = isAbsoluteUrl(path) || !baseUrl
        ? path
        : joinUrls(baseUrl, path);

    if (!query) {
        return url;
    }

    const params = new URLSearchParams();

    for (const key in query as any) {
        if (!Object.prototype.hasOwnProperty.call(query, key)) {
            continue;
        }

        const value =
            (query as unknown as Record<string, QueryValueRuntime>)[key];

        appendQueryParam(params, key, value);
    }

    const queryString = params.toString();

    if (queryString) {
        url += url.includes('?')
            ? `&${queryString}`
            : `?${queryString}`;
    }

    return url;
};

const mergeHeaders = (
    ...groups: Array<HttpRequestHeaders | undefined>
): HttpRequestHeaders => {
    const result: HttpRequestHeaders = {};

    for (const group of groups) {
        if (!group) {
            continue;
        }

        for (const key in group) {
            if (!Object.prototype.hasOwnProperty.call(group, key)) {
                continue;
            }

            result[key] = group[key];
        }
    }

    return result;
};

const buildRequestBody = <TBody>(
    body: TBody | undefined,
    headers: HttpRequestHeaders,
): BodyInit | undefined => {
    if (body == null) {
        return undefined;
    }

    const isBodyInit =
        typeof body === 'string' ||
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof URLSearchParams ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body);

    if (isBodyInit) {
        return body as unknown as BodyInit;
    }

    let hasContentType = false;

    for (const headerName in headers) {
        if (!Object.prototype.hasOwnProperty.call(headers, headerName)) {
            continue;
        }

        if (headerName.toLowerCase() === 'content-type') {
            hasContentType = true;
            break;
        }
    }

    if (!hasContentType) {
        headers['Content-Type'] = 'application/json';
    }

    return JSON.stringify(body);
};

const extractApiErrorPayload = (
    data: unknown,
): ApiErrorPayload | undefined => {
    if (!data || typeof data !== 'object') {
        return undefined;
    }

    const payload = data as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
    };

    if (
        typeof payload.code === 'string' &&
        typeof payload.message === 'string'
    ) {
        return {
            code: payload.code,
            message: payload.message,
            details:
                payload.details && typeof payload.details === 'object'
                    ? (payload.details as Record<string, unknown>)
                    : undefined,
        };
    }

    return undefined;
};

const isHttpResponse = (value: unknown): value is HttpResponse => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const anyValue = value as { status?: unknown; data?: unknown };

    return typeof anyValue.status === 'number' && 'data' in anyValue;
};

const defaultRetryableMethods: HttpMethod[] = ['GET', 'HEAD'];

const sleep = (ms: number): Promise<void> =>
    ms > 0
        ? new Promise(resolve => setTimeout(resolve, ms))
        : Promise.resolve();

const defaultShouldRetry = (context: HttpRetryContext): boolean => {
    const { error, attempt, maxRetries, requestConfig } = context;

    if (attempt >= maxRetries) {
        return false;
    }

    if (!defaultRetryableMethods.includes(requestConfig.method)) {
        return false;
    }

    return (
        error.code === HttpErrorCode.Network ||
        error.code === HttpErrorCode.Timeout ||
        error.code === HttpErrorCode.ServerError ||
        error.code === HttpErrorCode.TooManyRequests
    );
};

const nowMs = (): number =>
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

const SENSITIVE_HEADER_NAMES = new Set([
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-access-token',
    'x-refresh-token',
    'authorization',
]);

const SENSITIVE_KEY_PARTS = [
    'password',
    'passwd',
    'pwd',
    'token',
    'secret',
    'apikey',
    'api_key',
    'refresh',
    'email',
    'phone',
    'username',
    'telegram',
    'handle',
    'first_name',
    'last_name',
    'middle_name',
];

const isSensitiveKey = (key: string): boolean => {
    const normalized = key.toLowerCase();
    return SENSITIVE_KEY_PARTS.some(part => normalized.includes(part));
};

const sanitizeHeadersForLog = (
    headers: HttpRequestHeaders,
): HttpRequestHeaders => {
    const out: HttpRequestHeaders = {};

    for (const key in headers) {
        if (!Object.prototype.hasOwnProperty.call(headers, key)) {
            continue;
        }

        const lower = key.toLowerCase();

        if (SENSITIVE_HEADER_NAMES.has(lower)) {
            out[key] = '[REDACTED]';
            continue;
        }

        const value = String(headers[key] ?? '');
        out[key] =
            value.length > 300
                ? `${value.slice(0, 300)}…`
                : value;
    }

    return out;
};

const sanitizeQueryForLog = (
    query?: HttpRequestQuery<any>,
): Record<string, unknown> | undefined => {
    if (!query) {
        return undefined;
    }

    const out: Record<string, unknown> = {};

    for (const key in query as any) {
        if (!Object.prototype.hasOwnProperty.call(query, key)) {
            continue;
        }

        const value =
            (query as unknown as Record<string, unknown>)[key];

        if (value === undefined || value === null) {
            continue;
        }

        out[key] = isSensitiveKey(key)
            ? '[REDACTED]'
            : value;
    }

    return out;
};

const sanitizeBodyForLog = (body: unknown): unknown => {
    if (body == null) {
        return body;
    }

    if (typeof body === 'string') {
        return body.length > 300
            ? `${body.slice(0, 300)}…`
            : body;
    }

    if (body instanceof FormData) {
        return { type: 'FormData' };
    }

    if (body instanceof Blob) {
        return { type: 'Blob', size: body.size };
    }

    if (body instanceof URLSearchParams) {
        return { type: 'URLSearchParams' };
    }

    if (body instanceof ArrayBuffer) {
        return {
            type: 'ArrayBuffer',
            byteLength: body.byteLength,
        };
    }

    if (ArrayBuffer.isView(body)) {
        return {
            type: 'ArrayBufferView',
            byteLength: (body as ArrayBufferView).byteLength,
        };
    }

    if (Array.isArray(body)) {
        if (body.length > 50) {
            return {
                type: 'Array',
                length: body.length,
            };
        }

        return body.map(item => {
            if (typeof item === 'string') {
                return item.length > 120
                    ? `${item.slice(0, 120)}…`
                    : item;
            }

            if (
                typeof item === 'number' ||
                typeof item === 'boolean' ||
                item == null
            ) {
                return item;
            }

            return '[Object]';
        });
    }

    if (typeof body === 'object') {
        const source = body as Record<string, unknown>;
        const out: Record<string, unknown> = {};

        for (const key of Object.keys(source)) {
            const value = source[key];

            if (isSensitiveKey(key)) {
                out[key] = '[REDACTED]';
                continue;
            }

            if (Array.isArray(value)) {
                out[key] =
                    value.length > 50
                        ? { type: 'Array', length: value.length }
                        : value;
                continue;
            }

            if (value && typeof value === 'object') {
                out[key] = '[Object]';
                continue;
            }

            out[key] = value;
        }

        return out;
    }

    return body;
};

const createCorrelationId = (): string => {
    try {
        const anyCrypto: any =
            typeof crypto !== 'undefined'
                ? crypto
                : undefined;

        if (
            anyCrypto &&
            typeof anyCrypto.randomUUID === 'function'
        ) {
            return anyCrypto.randomUUID();
        }
    } catch {
        // ignore
    }

    return `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const findHeaderValueCaseInsensitive = (
    headers: HttpRequestHeaders | undefined,
    headerName: string,
): string | undefined => {
    if (!headers) {
        return undefined;
    }

    const target = headerName.toLowerCase();

    for (const key in headers) {
        if (!Object.prototype.hasOwnProperty.call(headers, key)) {
            continue;
        }

        if (key.toLowerCase() === target) {
            const value = headers[key];
            return value ? String(value) : undefined;
        }
    }

    return undefined;
};

const parseRetryAfterMs = (
    headers?: HttpRequestHeaders,
): number | undefined => {
    if (!headers) {
        return undefined;
    }

    const raw =
        findHeaderValueCaseInsensitive(headers, 'retry-after') ??
        findHeaderValueCaseInsensitive(headers, 'Retry-After');

    if (!raw) {
        return undefined;
    }

    const normalized = String(raw).trim();

    if (!normalized) {
        return undefined;
    }

    const seconds = Number(normalized);

    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(60_000, Math.floor(seconds * 1000));
    }

    const timestamp = Date.parse(normalized);

    if (Number.isFinite(timestamp)) {
        const delayMs = timestamp - Date.now();

        if (delayMs > 0) {
            return Math.min(60_000, Math.floor(delayMs));
        }
    }

    return undefined;
};

const maskUrlForLog = (url: string): string => {
    try {
        const parsed = isAbsoluteUrl(url)
            ? new URL(url)
            : new URL(url, 'http://local');

        parsed.username = '';
        parsed.password = '';

        for (const [key] of parsed.searchParams.entries()) {
            if (isSensitiveKey(key)) {
                parsed.searchParams.set(key, '[REDACTED]');
            }
        }

        if (!isAbsoluteUrl(url)) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }

        return parsed.toString();
    } catch {
        return url;
    }
};

const pickTrace = (
    headers: HttpRequestHeaders,
): Record<string, string | undefined> => {
    const correlationId =
        findHeaderValueCaseInsensitive(headers, 'x-correlation-id') ??
        findHeaderValueCaseInsensitive(headers, 'x-request-id') ??
        undefined;

    const traceparent =
        findHeaderValueCaseInsensitive(headers, 'traceparent');

    return {
        correlationId,
        traceparent,
    };
};

const resolveFetchImplementation = (
    options?: HttpClientFactoryOptions,
): typeof fetch => {
    if (options?.fetchFn) {
        return options.fetchFn;
    }

    if (typeof fetch === 'function') {
        return fetch.bind(globalThis) as typeof fetch;
    }

    throw new Error(
        'createHttpClient requires a fetch implementation',
    );
};

export const createHttpClient = (
    options?: HttpClientFactoryOptions,
): HttpClient => {
    const interceptors: InternalHttpInterceptorManager =
        createHttpInterceptorManager();

    const defaultBaseUrl = options?.baseUrl;
    const defaultHeaders = options?.defaultHeaders ?? {};
    const defaultTimeoutMs = options?.timeoutMs;
    const fetchImpl = resolveFetchImplementation(options);
    const retryPolicy = options?.retryPolicy;

    logger.info('HttpClient factory initialized', {
        baseUrl: defaultBaseUrl,
        timeoutMs: defaultTimeoutMs,
        hasRetryPolicy: Boolean(retryPolicy),
        retryPolicy: retryPolicy
            ? {
                maxRetries: retryPolicy.maxRetries,
                baseDelayMs: retryPolicy.baseDelayMs,
                backoffMultiplier: retryPolicy.backoffMultiplier,
                maxDelayMs: retryPolicy.maxDelayMs,
                hasCustomShouldRetry:
                    typeof retryPolicy.shouldRetry === 'function',
            }
            : undefined,
    });

    const runErrorPipeline = async <TResponse>(
        error: unknown,
    ): Promise<HttpResponse<TResponse>> => {
        const normalizedError = normalizeHttpError(error, {
            code: isAbortLikeError(error)
                ? HttpErrorCode.Aborted
                : undefined,
            status:
                (typeof (error as any)?.status === 'number'
                    ? (error as any).status
                    : undefined) ??
                (typeof (error as any)?.statusCode === 'number'
                    ? (error as any).statusCode
                    : undefined),
        });

        const logLevel =
            normalizedError.code === HttpErrorCode.Aborted
                ? 'debug'
                : 'warn';

        logger[logLevel]('Error pipeline start', {
            code: normalizedError.code,
            status: normalizedError.status,
            method: normalizedError.method,
            url: normalizedError.url
                ? maskUrlForLog(normalizedError.url)
                : undefined,
        });

        const finalValue =
            await interceptors._runErrorInterceptors(normalizedError);

        if (isHttpResponse(finalValue)) {
            logger.warn('Error pipeline transformed error into response', {
                status: finalValue.status,
            });

            return finalValue as HttpResponse<TResponse>;
        }

        logger[logLevel]('Error pipeline end (throw)');
        throw finalValue;
    };

    const performSingleRequest = async <
        TResponse,
        TBody,
        TQuery extends object,
    >(
        rawConfig: HttpRequestConfig<TBody, TQuery>,
    ): Promise<HttpResponse<TResponse>> => {
        const mergedConfig: HttpRequestConfig<TBody, TQuery> = {
            ...rawConfig,
            baseUrl: rawConfig.baseUrl ?? defaultBaseUrl,
            timeoutMs: rawConfig.timeoutMs ?? defaultTimeoutMs,
            headers: mergeHeaders(defaultHeaders, rawConfig.headers),
        };

        let config: HttpRequestConfig<TBody, TQuery>;

        try {
            config =
                await interceptors._runRequestInterceptors<TBody, TQuery>(
                    mergedConfig,
                );
        } catch (error) {
            logger.error(error, {
                stage: 'request-interceptors',
                method: mergedConfig.method,
                url: mergedConfig.url,
            });

            return runErrorPipeline<TResponse>(error);
        }

        const url = buildUrl(
            config.baseUrl,
            config.url,
            config.query as HttpRequestQuery<any>,
        );

        const headers = mergeHeaders(
            config.headers,
            {
                Accept: 'application/json, text/plain, */*',
            },
        );

        const trace = pickTrace(headers);
        const body = buildRequestBody(config.body, headers);
        const timeoutMs = config.timeoutMs;

        let abortController: AbortController | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let signal: AbortSignal | undefined = config.signal;
        let didTimeout = false;

        const startedAt = nowMs();

        logger.info('HTTP request start', {
            method: config.method,
            url: maskUrlForLog(url),
            baseUrl: config.baseUrl,
            timeoutMs,
            withCredentials: Boolean(config.withCredentials),
            trace,
            headers: sanitizeHeadersForLog(headers),
            query: sanitizeQueryForLog(
                config.query as HttpRequestQuery<any>,
            ),
            body: sanitizeBodyForLog(config.body),
        });

        if (
            typeof AbortController !== 'undefined' &&
            timeoutMs &&
            timeoutMs > 0
        ) {
            abortController = new AbortController();
            signal = abortController.signal;

            if (config.signal) {
                if (config.signal.aborted) {
                    abortController.abort();
                } else {
                    config.signal.addEventListener(
                        'abort',
                        () => {
                            abortController?.abort();
                        },
                        { once: true },
                    );
                }
            }

            timeoutId = setTimeout(() => {
                didTimeout = true;
                abortController?.abort();
            }, timeoutMs);
        }

        try {
            const response = await fetchImpl(url, {
                method: config.method,
                headers,
                body,
                signal,
                /**
                 * Важно:
                 * при withCredentials=false не тащим cookies даже на same-origin.
                 */
                credentials: config.withCredentials
                    ? 'include'
                    : 'omit',
            });

            const responseHeaders: HttpRequestHeaders = {};

            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            const contentType =
                response.headers.get('content-type') ??
                response.headers.get('Content-Type') ??
                '';

            let data: unknown;

            if (response.status === 204 || response.status === 205) {
                data = null;
            } else if (contentType.includes('application/json')) {
                const rawText = await response.text();

                try {
                    data = rawText ? JSON.parse(rawText) : null;
                } catch {
                    data = rawText;
                }
            } else {
                data = await response.text();
            }

            const rawHttpResponse: HttpResponse<TResponse> = {
                status: response.status,
                headers: responseHeaders,
                data: data as TResponse,
            };

            let processedResponse: HttpResponse<TResponse>;

            try {
                processedResponse =
                    await interceptors._runResponseInterceptors(
                        rawHttpResponse,
                    );
            } catch (error) {
                logger.error(error, {
                    stage: 'response-interceptors',
                    method: config.method,
                    url: maskUrlForLog(url),
                    status: rawHttpResponse.status,
                });

                const clientError = createHttpError({
                    message:
                        (error as any)?.message ??
                        'Response processing failed',
                    code: HttpErrorCode.Unknown,
                    status: rawHttpResponse.status,
                    responseHeaders: rawHttpResponse.headers,
                    details: {
                        interceptorError: error,
                        responseData: rawHttpResponse.data,
                    },
                    method: config.method,
                    url,
                });

                return runErrorPipeline<TResponse>(clientError);
            }

            const elapsedMs = Math.max(0, nowMs() - startedAt);

            if (!response.ok) {
                logger.warn('HTTP response (non-OK)', {
                    method: config.method,
                    url: maskUrlForLog(url),
                    status: response.status,
                    ms: elapsedMs,
                    trace,
                    responseHeaders: sanitizeHeadersForLog(
                        processedResponse.headers,
                    ),
                });

                const payload =
                    extractApiErrorPayload(processedResponse.data);

                const httpError = createHttpError({
                    message:
                        payload?.message ||
                        response.statusText ||
                        'Request failed',
                    status: response.status,
                    details: processedResponse.data,
                    method: config.method,
                    url,
                    responseHeaders: processedResponse.headers,
                }) as ApiErrorLike;

                if (payload) {
                    httpError.payload = payload;
                }

                return runErrorPipeline<TResponse>(httpError);
            }

            logger.info('HTTP response end', {
                method: config.method,
                url: maskUrlForLog(url),
                status: response.status,
                ms: elapsedMs,
                trace,
                responseHeaders: sanitizeHeadersForLog(
                    processedResponse.headers,
                ),
            });

            return processedResponse;
        } catch (error) {
            const elapsedMs = Math.max(0, nowMs() - startedAt);

            if (didTimeout || isAbortLikeError(error)) {
                const level = didTimeout ? 'warn' : 'debug';

                logger[level]('HTTP request aborted', {
                    method: config.method,
                    url: maskUrlForLog(url),
                    ms: elapsedMs,
                    trace,
                    timeoutMs,
                    didTimeout,
                });

                const abortedError = createHttpError({
                    message: didTimeout
                        ? 'Request timed out'
                        : 'Request was aborted',
                    code: didTimeout
                        ? HttpErrorCode.Timeout
                        : HttpErrorCode.Aborted,
                    method: config.method,
                    url,
                    details: error,
                });

                return runErrorPipeline<TResponse>(abortedError);
            }

            if (isHttpError(error)) {
                const level =
                    error.code === HttpErrorCode.Aborted
                        ? 'debug'
                        : 'warn';

                logger[level](
                    'HTTP request error (already normalized)',
                    {
                        method: config.method,
                        url: maskUrlForLog(url),
                        ms: elapsedMs,
                        trace,
                        code: error.code,
                        status: error.status,
                    },
                );

                return runErrorPipeline<TResponse>(error);
            }

            logger.error(error, {
                stage: 'fetch',
                method: config.method,
                url: maskUrlForLog(url),
                ms: elapsedMs,
                trace,
            });

            const networkError = createHttpError({
                message:
                    (error as { message?: string })?.message ??
                    'Network error',
                code: HttpErrorCode.Network,
                details: error,
                method: config.method,
                url,
            });

            return runErrorPipeline<TResponse>(networkError);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    };

    const performRequest = async <
        TResponse,
        TBody,
        TQuery extends object,
    >(
        rawConfig: HttpRequestConfig<TBody, TQuery>,
    ): Promise<HttpResponse<TResponse>> => {
        const policy = retryPolicy;

        const initialHeaders = mergeHeaders(rawConfig.headers);

        const existingCorrelationId =
            findHeaderValueCaseInsensitive(
                initialHeaders,
                'x-correlation-id',
            ) ??
            findHeaderValueCaseInsensitive(
                initialHeaders,
                'x-request-id',
            );

        const correlationId =
            existingCorrelationId ?? createCorrelationId();

        const configWithTrace: HttpRequestConfig<TBody, TQuery> =
            existingCorrelationId
                ? rawConfig
                : {
                    ...rawConfig,
                    headers: mergeHeaders(rawConfig.headers, {
                        'x-correlation-id': correlationId,
                    }),
                };

        if (!policy || policy.maxRetries <= 0) {
            logger.debug('HTTP performRequest (no retries)', {
                method: configWithTrace.method,
                url: configWithTrace.url,
                trace: { correlationId },
            });

            return performSingleRequest<TResponse, TBody, TQuery>(
                configWithTrace,
            );
        }

        const maxRetries = Math.max(0, policy.maxRetries);
        const baseDelayMs = policy.baseDelayMs ?? 0;
        const backoffMultiplier = policy.backoffMultiplier ?? 1;
        const maxDelayMs =
            policy.maxDelayMs ?? Number.MAX_SAFE_INTEGER;

        let lastError: HttpErrorLike | undefined;
        const totalAttempts = maxRetries + 1;
        let forcedNextDelayMs: number | null = null;

        logger.debug('HTTP performRequest (with retries)', {
            method: configWithTrace.method,
            url: configWithTrace.url,
            maxRetries,
            trace: { correlationId },
        });

        for (let attempt = 0; attempt < totalAttempts; attempt++) {
            if (attempt > 0) {
                let delay = 0;

                if (forcedNextDelayMs != null) {
                    delay = forcedNextDelayMs;
                    forcedNextDelayMs = null;
                } else if (baseDelayMs > 0) {
                    delay = baseDelayMs;

                    if (backoffMultiplier !== 1) {
                        delay =
                            baseDelayMs *
                            Math.pow(backoffMultiplier, attempt - 1);
                    }

                    if (delay > maxDelayMs) {
                        delay = maxDelayMs;
                    }
                }

                if (delay > 0) {
                    logger.warn('Retry delay', {
                        method: configWithTrace.method,
                        url: configWithTrace.url,
                        attempt,
                        delayMs: delay,
                        maxRetries,
                        trace: { correlationId },
                    });

                    // eslint-disable-next-line no-await-in-loop
                    await sleep(delay);
                }
            }

            logger.debug('Request attempt start', {
                method: configWithTrace.method,
                url: configWithTrace.url,
                attempt,
                maxRetries,
                trace: { correlationId },
            });

            try {
                const response =
                    await performSingleRequest<TResponse, TBody, TQuery>(
                        configWithTrace,
                    );

                logger.debug('Request attempt success', {
                    method: configWithTrace.method,
                    url: configWithTrace.url,
                    attempt,
                    status: response.status,
                    trace: { correlationId },
                });

                return response;
            } catch (error) {
                const normalizedError = normalizeHttpError(error, {
                    message:
                        (error as any)?.message ??
                        'Unknown HTTP error',
                    method: configWithTrace.method,
                    url: configWithTrace.url,
                    status:
                        (typeof (error as any)?.status === 'number'
                            ? (error as any).status
                            : undefined) ??
                        (typeof (error as any)?.statusCode === 'number'
                            ? (error as any).statusCode
                            : undefined),
                    code: isAbortLikeError(error)
                        ? HttpErrorCode.Aborted
                        : undefined,
                });

                lastError = normalizedError;

                if (normalizedError.code === HttpErrorCode.Aborted) {
                    logger.debug('Request attempt aborted (no retry)', {
                        method: configWithTrace.method,
                        url: configWithTrace.url,
                        attempt,
                        maxRetries,
                        trace: { correlationId },
                    });

                    throw normalizedError;
                }

                const context: HttpRetryContext = {
                    error: normalizedError,
                    attempt,
                    maxRetries,
                    requestConfig:
                        configWithTrace as HttpRequestConfig<any, any>,
                };

                const shouldRetry =
                    typeof policy.shouldRetry === 'function'
                        ? policy.shouldRetry(context)
                        : defaultShouldRetry(context);

                logger.warn('Retry decision', {
                    method: configWithTrace.method,
                    url: configWithTrace.url,
                    attempt,
                    maxRetries,
                    shouldRetry,
                    error: {
                        code: normalizedError.code,
                        status: normalizedError.status,
                        message: normalizedError.message,
                    },
                    trace: { correlationId },
                });

                if (!shouldRetry || attempt >= maxRetries) {
                    logger.error(normalizedError, {
                        stage: 'final-failure',
                        method: configWithTrace.method,
                        url: configWithTrace.url,
                        attempt,
                        maxRetries,
                        trace: { correlationId },
                    });

                    throw normalizedError;
                }

                if (
                    normalizedError.code ===
                    HttpErrorCode.TooManyRequests
                ) {
                    const retryAfterMs = parseRetryAfterMs(
                        normalizedError.responseHeaders,
                    );

                    if (
                        typeof retryAfterMs === 'number' &&
                        retryAfterMs > 0
                    ) {
                        forcedNextDelayMs = retryAfterMs;
                    }
                }
            }
        }

        throw (
            lastError ??
            createHttpError({
                message: 'Unknown HTTP error',
                code: HttpErrorCode.Unknown,
            })
        );
    };

    return {
        interceptors,

        request: performRequest,

        get<
            TResponse = unknown,
            TQuery extends object = Record<string, unknown>,
        >(
            url: string,
            config?: Omit<
                HttpRequestConfig<never, TQuery>,
                'url' | 'method' | 'body'
            >,
        ): Promise<HttpResponse<TResponse>> {
            return performRequest<TResponse, never, TQuery>({
                ...(config as
                    | HttpRequestConfig<never, TQuery>
                    | undefined),
                url,
                method: 'GET',
            });
        },

        post<
            TResponse = unknown,
            TBody = unknown,
            TQuery extends object = Record<string, unknown>,
        >(
            url: string,
            body?: TBody,
            config?: Omit<
                HttpRequestConfig<TBody, TQuery>,
                'url' | 'method' | 'body'
            >,
        ): Promise<HttpResponse<TResponse>> {
            return performRequest<TResponse, TBody, TQuery>({
                ...(config as
                    | HttpRequestConfig<TBody, TQuery>
                    | undefined),
                url,
                method: 'POST',
                body,
            });
        },

        put<
            TResponse = unknown,
            TBody = unknown,
            TQuery extends object = Record<string, unknown>,
        >(
            url: string,
            body?: TBody,
            config?: Omit<
                HttpRequestConfig<TBody, TQuery>,
                'url' | 'method' | 'body'
            >,
        ): Promise<HttpResponse<TResponse>> {
            return performRequest<TResponse, TBody, TQuery>({
                ...(config as
                    | HttpRequestConfig<TBody, TQuery>
                    | undefined),
                url,
                method: 'PUT',
                body,
            });
        },

        patch<
            TResponse = unknown,
            TBody = unknown,
            TQuery extends object = Record<string, unknown>,
        >(
            url: string,
            body?: TBody,
            config?: Omit<
                HttpRequestConfig<TBody, TQuery>,
                'url' | 'method' | 'body'
            >,
        ): Promise<HttpResponse<TResponse>> {
            return performRequest<TResponse, TBody, TQuery>({
                ...(config as
                    | HttpRequestConfig<TBody, TQuery>
                    | undefined),
                url,
                method: 'PATCH',
                body,
            });
        },

        delete<
            TResponse = unknown,
            TQuery extends object = Record<string, unknown>,
        >(
            url: string,
            config?: Omit<
                HttpRequestConfig<never, TQuery>,
                'url' | 'method' | 'body'
            >,
        ): Promise<HttpResponse<TResponse>> {
            return performRequest<TResponse, never, TQuery>({
                ...(config as
                    | HttpRequestConfig<never, TQuery>
                    | undefined),
                url,
                method: 'DELETE',
            });
        },
    };
};