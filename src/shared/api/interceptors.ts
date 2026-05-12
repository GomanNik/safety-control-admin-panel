// =====================
// shared/api/interceptors.ts
// =====================

import type { HttpRequestConfig, HttpResponse } from './types';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger().child('shared').child('api').child('interceptors');

export type HttpRequestInterceptor = (
    config: HttpRequestConfig<any, any>,
) => HttpRequestConfig<any, any> | Promise<HttpRequestConfig<any, any>>;

export type HttpResponseInterceptor = (
    response: HttpResponse,
) => HttpResponse | Promise<HttpResponse>;

export type HttpErrorInterceptor = (
    error: unknown,
) => unknown | Promise<unknown>;

export interface HttpInterceptorManager {
    addRequestInterceptor(fn: HttpRequestInterceptor): void;
    removeRequestInterceptor(fn: HttpRequestInterceptor): void;

    addResponseInterceptor(fn: HttpResponseInterceptor): void;
    removeResponseInterceptor(fn: HttpResponseInterceptor): void;

    addErrorInterceptor(fn: HttpErrorInterceptor): void;
    removeErrorInterceptor(fn: HttpErrorInterceptor): void;
}

export interface InternalHttpInterceptorManager extends HttpInterceptorManager {
    _runRequestInterceptors<TBody, TQuery extends object>(
        config: HttpRequestConfig<TBody, TQuery>,
    ): Promise<HttpRequestConfig<TBody, TQuery>>;

    _runResponseInterceptors<T>(response: HttpResponse<T>): Promise<HttpResponse<T>>;

    _runErrorInterceptors(error: unknown): Promise<unknown>;
}

const fnName = (fn: Function): string => fn.name && fn.name.trim() !== '' ? fn.name : 'anonymous';

const isHttpResponseLike = (value: unknown): value is HttpResponse => {
    if (!value || typeof value !== 'object') return false;
    const v = value as { status?: unknown; data?: unknown; headers?: unknown };
    return typeof v.status === 'number' && 'data' in v && 'headers' in v;
};

export const createHttpInterceptorManager = (): InternalHttpInterceptorManager => {
    const requestInterceptors: HttpRequestInterceptor[] = [];
    const responseInterceptors: HttpResponseInterceptor[] = [];
    const errorInterceptors: HttpErrorInterceptor[] = [];

    return {
        addRequestInterceptor(fn) {
            requestInterceptors.push(fn);
            logger.debug('Request interceptor added', { name: fnName(fn), total: requestInterceptors.length });
        },
        removeRequestInterceptor(fn) {
            const idx = requestInterceptors.indexOf(fn);
            if (idx >= 0) requestInterceptors.splice(idx, 1);
            logger.debug('Request interceptor removed', { name: fnName(fn), total: requestInterceptors.length });
        },

        addResponseInterceptor(fn) {
            responseInterceptors.push(fn);
            logger.debug('Response interceptor added', { name: fnName(fn), total: responseInterceptors.length });
        },
        removeResponseInterceptor(fn) {
            const idx = responseInterceptors.indexOf(fn);
            if (idx >= 0) responseInterceptors.splice(idx, 1);
            logger.debug('Response interceptor removed', { name: fnName(fn), total: responseInterceptors.length });
        },

        addErrorInterceptor(fn) {
            errorInterceptors.push(fn);
            logger.debug('Error interceptor added', { name: fnName(fn), total: errorInterceptors.length });
        },
        removeErrorInterceptor(fn) {
            const idx = errorInterceptors.indexOf(fn);
            if (idx >= 0) errorInterceptors.splice(idx, 1);
            logger.debug('Error interceptor removed', { name: fnName(fn), total: errorInterceptors.length });
        },

        async _runRequestInterceptors<TBody, TQuery extends object>(
            config: HttpRequestConfig<TBody, TQuery>,
        ): Promise<HttpRequestConfig<TBody, TQuery>> {
            let current: HttpRequestConfig<any, any> = config as HttpRequestConfig<any, any>;

            logger.debug('Running request interceptors', {
                count: requestInterceptors.length,
                method: config.method,
                url: config.url,
            });

            for (let i = 0; i < requestInterceptors.length; i++) {
                const interceptor = requestInterceptors[i];
                const name = fnName(interceptor);

                logger.debug('Request interceptor start', { index: i, name });

                try {
                    current = await interceptor(current);
                } catch (error) {
                    logger.error(error, { stage: 'request-interceptor', index: i, name });
                    throw error;
                }

                logger.debug('Request interceptor end', { index: i, name });
            }

            return current as HttpRequestConfig<TBody, TQuery>;
        },

        async _runResponseInterceptors<T>(response: HttpResponse<T>) {
            let current: HttpResponse = response as HttpResponse;

            logger.debug('Running response interceptors', {
                count: responseInterceptors.length,
                status: response.status,
            });

            for (let i = 0; i < responseInterceptors.length; i++) {
                const interceptor = responseInterceptors[i];
                const name = fnName(interceptor);

                logger.debug('Response interceptor start', { index: i, name });

                try {
                    current = await interceptor(current);
                } catch (error) {
                    logger.error(error, { stage: 'response-interceptor', index: i, name });
                    throw error;
                }

                logger.debug('Response interceptor end', { index: i, name });
            }

            return current as HttpResponse<T>;
        },

        async _runErrorInterceptors(error: unknown) {
            let current: unknown = error;

            logger.debug('Running error interceptors', { count: errorInterceptors.length });

            for (let i = 0; i < errorInterceptors.length; i++) {
                if (isHttpResponseLike(current)) {
                    // уже превратили ошибку в response — дальше не гоняем
                    break;
                }

                const interceptor = errorInterceptors[i];
                const name = fnName(interceptor);

                logger.debug('Error interceptor start', { index: i, name });

                try {
                    current = await interceptor(current);
                } catch (e) {
                    logger.error(e, { stage: 'error-interceptor', index: i, name });
                    throw e;
                }

                logger.debug('Error interceptor end', { index: i, name });
            }

            return current;
        },
    };
};