// =====================
// File: src/entities/address-registry/api.ts
// Purpose:
// - Thin API client for official address registry
// - Frontend talks only to internal backend proxy endpoint
// =====================

import type {
    HttpClient,
    HttpClientRequestOptions,
} from '../../shared/api';

import {
    createRestResourceClient,
    isAbortLikeError,
} from '../../shared/api';

import { getGlobalLogger } from '../../shared/logging';

import type {
    AddressRegistrySearchQueryDto,
    AddressRegistrySearchResponseDto,
} from './types';

export type AddressRegistryApiRequestOptions = HttpClientRequestOptions;

export interface AddressRegistryApiClient {
    searchBuildings(
        query: AddressRegistrySearchQueryDto,
        options?: AddressRegistryApiRequestOptions,
    ): Promise<AddressRegistrySearchResponseDto>;
}

export const ADDRESS_REGISTRY_API_BASE_PATH = '/address-registry';

const logger = getGlobalLogger()
    .child('entities')
    .child('address-registry')
    .child('api');

const now = (): number => Date.now();

const safePreview = (
    value: unknown,
    maxLen: number = 96,
): string => {
    const normalized = String(value ?? '');

    return normalized.length <= maxLen
        ? normalized
        : `${normalized.slice(0, maxLen)}…`;
};

const getApiStatus = (
    error: unknown,
): number | undefined => {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const candidate = error as {
        status?: unknown;
        statusCode?: unknown;
    };

    if (typeof candidate.status === 'number') {
        return candidate.status;
    }

    if (typeof candidate.statusCode === 'number') {
        return candidate.statusCode;
    }

    return undefined;
};

const normalizeBasePath = (
    basePath: string,
): string => {
    const normalized = String(basePath ?? '').trim();

    if (!normalized || normalized === '/') {
        return ADDRESS_REGISTRY_API_BASE_PATH;
    }

    const withLeadingSlash = normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;

    const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');

    return withoutTrailingSlash || ADDRESS_REGISTRY_API_BASE_PATH;
};

const logStart = (
    operation: string,
    requestId: string,
    meta?: Record<string, unknown>,
): void => {
    logger.debug('address registry api start', {
        op: operation,
        requestId,
        ...(meta ?? {}),
    });
};

const logOk = (
    operation: string,
    requestId: string,
    startedAt: number,
    meta?: Record<string, unknown>,
): void => {
    logger.debug('address registry api ok', {
        op: operation,
        requestId,
        durationMs: now() - startedAt,
        ...(meta ?? {}),
    });
};

const logFail = (
    operation: string,
    requestId: string,
    startedAt: number,
    error: unknown,
    meta?: Record<string, unknown>,
): void => {
    if (isAbortLikeError(error)) {
        logger.debug('address registry api aborted', {
            op: operation,
            requestId,
            durationMs: now() - startedAt,
            ...(meta ?? {}),
        });

        return;
    }

    logger.warn('address registry api failed', {
        op: operation,
        requestId,
        durationMs: now() - startedAt,
        apiStatus: getApiStatus(error),
        ...(meta ?? {}),
    });
};

export function createAddressRegistryApiClient(
    httpClient: HttpClient,
    basePath: string = ADDRESS_REGISTRY_API_BASE_PATH,
): AddressRegistryApiClient {
    const rootPath = normalizeBasePath(basePath);

    return createRestResourceClient<AddressRegistryApiClient>(
        { httpClient, basePath: rootPath },
        ({ httpClient: client, basePath: resolvedBasePath }) => ({
            async searchBuildings(query, options) {
                const requestId = `searchBuildings:${now()}:${safePreview(query.query)}`;
                const startedAt = now();

                logStart('searchBuildings', requestId, {
                    query: safePreview(query.query),
                    limit: query.limit,
                });

                try {
                    const response = await client.get<
                        AddressRegistrySearchResponseDto,
                        AddressRegistrySearchQueryDto
                    >(
                        `${resolvedBasePath}/buildings`,
                        {
                            signal: options?.signal,
                            timeoutMs: options?.timeoutMs,
                            headers: options?.headers,
                            query,
                        },
                    );

                    logOk('searchBuildings', requestId, startedAt, {
                        query: safePreview(query.query),
                        limit: query.limit,
                        itemsCount: response.data?.items?.length ?? 0,
                    });

                    return response.data;
                } catch (error) {
                    logFail('searchBuildings', requestId, startedAt, error, {
                        query: safePreview(query.query),
                        limit: query.limit,
                    });

                    throw error;
                }
            },
        }),
    );
}