// =====================
// File: src/shared/api/configured-client.ts
// Purpose:
// - Create HttpClient from shared ApiConfig
// - Keep one focused factory instead of multiple thin wrappers
// =====================

import { getGlobalLogger } from '../logging';
import type { ApiConfig } from '../config';
import {
    createHttpClient,
    type HttpClient,
    type HttpClientFactoryOptions,
    type HttpRetryPolicy,
} from './http-client';

/**
 * Дополнительные опции создания HttpClient на базе ApiConfig.
 * Не даём напрямую прокидывать retryPolicy,
 * чтобы не перезатирать retryCount из ApiConfig.
 */
export interface CreateHttpClientFromApiConfigOptions
    extends Omit<
        HttpClientFactoryOptions,
        'baseUrl' | 'timeoutMs' | 'retryPolicy'
    > {
    /**
     * Переопределения политики ретраев.
     * maxRetries по умолчанию берётся
     * из ApiConfig.retryCount.
     */
    retryPolicyOverrides?: Partial<HttpRetryPolicy>;
}

/**
 * Создаёт HttpClient на базе ApiConfig (shared/config).
 * Значение retryCount из ApiConfig маппится
 * в HttpRetryPolicy.maxRetries.
 */
export const createHttpClientFromApiConfig = (
    apiConfig: ApiConfig,
    options?: CreateHttpClientFromApiConfigOptions,
): HttpClient => {
    const logger = getGlobalLogger()
        .child('shared')
        .child('api')
        .child('configured-client');

    const { retryPolicyOverrides, ...factoryOptions } =
    options ?? {};

    const hasRetries = apiConfig.retryCount > 0;

    const retryPolicy: HttpRetryPolicy | undefined =
        hasRetries
            ? {
                maxRetries: apiConfig.retryCount,
                baseDelayMs:
                    retryPolicyOverrides?.baseDelayMs ??
                    250,
                backoffMultiplier:
                    retryPolicyOverrides?.backoffMultiplier ??
                    2,
                maxDelayMs:
                    retryPolicyOverrides?.maxDelayMs ??
                    4_000,
                shouldRetry:
                retryPolicyOverrides?.shouldRetry,
            }
            : undefined;

    logger.info('Creating HttpClient from ApiConfig', {
        baseUrl: apiConfig.baseUrl,
        timeoutMs: apiConfig.timeoutMs,
        retryCount: apiConfig.retryCount,
        retryPolicy: retryPolicy
            ? {
                maxRetries: retryPolicy.maxRetries,
                baseDelayMs: retryPolicy.baseDelayMs,
                backoffMultiplier:
                retryPolicy.backoffMultiplier,
                maxDelayMs: retryPolicy.maxDelayMs,
                hasCustomShouldRetry:
                    typeof retryPolicy.shouldRetry ===
                    'function',
            }
            : undefined,
    });

    const client = createHttpClient({
        ...factoryOptions,
        baseUrl: apiConfig.baseUrl,
        timeoutMs: apiConfig.timeoutMs,
        retryPolicy,
    });

    logger.info('HttpClient created');

    return client;
};