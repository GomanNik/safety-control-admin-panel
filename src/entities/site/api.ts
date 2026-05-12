// =====================
// File: src/entities/site/api.ts
// Purpose:
// - Thin API client for Site entity
// - Operates on DTO contracts only
// - Bulk site actions are intentionally removed
// =====================

import type {
    SiteCreateDto,
    SiteDto,
    SiteListQueryDto,
    SiteListResponseDto,
    SiteMetricsDto,
    SitePatchDto,
} from './types';

import type {
    HttpClient,
    HttpClientRequestOptions,
    SiteId,
} from '../../shared/api';

import {
    createRestResourceClient,
    isAbortLikeError,
} from '../../shared/api';

import { getGlobalLogger } from '../../shared/logging';

export type SiteApiRequestOptions = HttpClientRequestOptions;

export interface SiteApiClient {
    getSiteById(
        id: SiteId,
        options?: SiteApiRequestOptions,
    ): Promise<SiteDto>;

    getSiteList(
        query: SiteListQueryDto,
        options?: SiteApiRequestOptions,
    ): Promise<SiteListResponseDto>;

    createSite(
        payload: SiteCreateDto,
        options?: SiteApiRequestOptions,
    ): Promise<SiteDto>;

    patchSite(
        id: SiteId,
        patch: SitePatchDto,
        options?: SiteApiRequestOptions,
    ): Promise<SiteDto>;

    deleteSite(
        id: SiteId,
        options?: SiteApiRequestOptions,
    ): Promise<void>;

    getSiteMetrics(
        query: SiteListQueryDto,
        options?: SiteApiRequestOptions,
    ): Promise<SiteMetricsDto>;
}

export const SITE_API_BASE_PATH = '/sites';

const logger = getGlobalLogger()
    .child('entities')
    .child('site')
    .child('api');

const now = (): number => Date.now();

const getApiStatus = (
    error: unknown,
): number | undefined => {
    if (!error) {
        return undefined;
    }

    const anyError = error as {
        status?: unknown;
        statusCode?: unknown;
    };

    if (typeof anyError.status === 'number') {
        return anyError.status;
    }

    if (typeof anyError.statusCode === 'number') {
        return anyError.statusCode;
    }

    return undefined;
};

const safePreview = (
    value: unknown,
    maxLen: number = 64,
): string => {
    const normalized = String(value ?? '');

    if (normalized.length <= maxLen) {
        return normalized;
    }

    return `${normalized.slice(0, maxLen)}…`;
};

const logStart = (
    operation: string,
    requestId: string,
    meta?: Record<string, unknown>,
): void => {
    logger.debug('site api start', {
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
    logger.debug('site api ok', {
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
        logger.debug('site api aborted', {
            op: operation,
            requestId,
            durationMs: now() - startedAt,
            ...(meta ?? {}),
        });

        return;
    }

    logger.warn('site api failed', {
        op: operation,
        requestId,
        durationMs: now() - startedAt,
        apiStatus: getApiStatus(error),
        ...(meta ?? {}),
    });
};

function normalizeBasePath(
    basePath: string,
): string {
    const normalized = String(basePath ?? '').trim();

    if (!normalized || normalized === '/') {
        return SITE_API_BASE_PATH;
    }

    const withLeadingSlash = normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;

    const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');

    return withoutTrailingSlash || SITE_API_BASE_PATH;
}

const getListQueryMeta = (
    query: SiteListQueryDto,
): Record<string, unknown> => ({
    page: query.page,
    pageSize: query.pageSize,
    regionsCount: query.region?.length ?? 0,
    hasSearch: Boolean(
        query.search &&
        String(query.search).trim().length > 0,
    ),
});

export function createSiteApiClient(
    httpClient: HttpClient,
    basePath: string = SITE_API_BASE_PATH,
): SiteApiClient {
    const rootPath = normalizeBasePath(basePath);

    return createRestResourceClient<SiteApiClient>(
        { httpClient, basePath: rootPath },
        ({ httpClient: client, basePath: resolvedBasePath }) => {
            const buildUrl = (
                suffix: string = '',
            ): string => (
                suffix ? `${resolvedBasePath}${suffix}` : resolvedBasePath
            );

            return {
                async getSiteById(id, options) {
                    const requestId = `getSiteById:${now()}:${safePreview(id)}`;
                    const startedAt = now();

                    logStart('getSiteById', requestId, {
                        siteId: safePreview(id),
                    });

                    try {
                        const response = await client.get<SiteDto>(
                            buildUrl(`/${id}`),
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                            },
                        );

                        logOk('getSiteById', requestId, startedAt, {
                            siteId: safePreview(response.data?.id ?? id),
                        });

                        return response.data;
                    } catch (error) {
                        logFail('getSiteById', requestId, startedAt, error, {
                            siteId: safePreview(id),
                        });

                        throw error;
                    }
                },

                async getSiteList(query, options) {
                    const requestId = `getSiteList:${now()}`;
                    const startedAt = now();
                    const meta = getListQueryMeta(query);

                    logStart('getSiteList', requestId, meta);

                    try {
                        const response = await client.get<
                            SiteListResponseDto,
                            SiteListQueryDto
                        >(
                            buildUrl(),
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                                query,
                            },
                        );

                        logOk('getSiteList', requestId, startedAt, {
                            ...meta,
                            itemsCount: response.data?.items?.length ?? 0,
                            total: response.data?.meta?.total,
                        });

                        return response.data;
                    } catch (error) {
                        logFail('getSiteList', requestId, startedAt, error, meta);
                        throw error;
                    }
                },

                async createSite(payload, options) {
                    const requestId = `createSite:${now()}:${safePreview(payload?.name)}`;
                    const startedAt = now();
                    const payloadKeys = Object.keys(payload ?? {});

                    logStart('createSite', requestId, {
                        payloadKeys,
                        name: safePreview(payload?.name),
                    });

                    try {
                        const response = await client.post<
                            SiteDto,
                            SiteCreateDto
                        >(
                            buildUrl(),
                            payload,
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                            },
                        );

                        logOk('createSite', requestId, startedAt, {
                            payloadKeys,
                            siteId: safePreview(response.data?.id),
                        });

                        return response.data;
                    } catch (error) {
                        logFail('createSite', requestId, startedAt, error, {
                            payloadKeys,
                            name: safePreview(payload?.name),
                        });

                        throw error;
                    }
                },

                async patchSite(id, patch, options) {
                    const requestId = `patchSite:${now()}:${safePreview(id)}`;
                    const startedAt = now();

                    const patchKeys = Object.keys(patch ?? {});

                    logStart('patchSite', requestId, {
                        siteId: safePreview(id),
                        patchKeys,
                    });

                    try {
                        const response = await client.patch<
                            SiteDto,
                            SitePatchDto
                        >(
                            buildUrl(`/${id}`),
                            patch,
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                            },
                        );

                        logOk('patchSite', requestId, startedAt, {
                            siteId: safePreview(response.data?.id ?? id),
                            patchKeys,
                        });

                        return response.data;
                    } catch (error) {
                        logFail('patchSite', requestId, startedAt, error, {
                            siteId: safePreview(id),
                            patchKeys,
                        });

                        throw error;
                    }
                },

                async deleteSite(id, options) {
                    const requestId = `deleteSite:${now()}:${safePreview(id)}`;
                    const startedAt = now();

                    logStart('deleteSite', requestId, {
                        siteId: safePreview(id),
                    });

                    try {
                        await client.delete<void>(
                            buildUrl(`/${id}`),
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                            },
                        );

                        logOk('deleteSite', requestId, startedAt, {
                            siteId: safePreview(id),
                        });
                    } catch (error) {
                        logFail('deleteSite', requestId, startedAt, error, {
                            siteId: safePreview(id),
                        });

                        throw error;
                    }
                },

                async getSiteMetrics(query, options) {
                    const requestId = `getSiteMetrics:${now()}`;
                    const startedAt = now();
                    const meta = getListQueryMeta(query);

                    logStart('getSiteMetrics', requestId, meta);

                    try {
                        const response = await client.get<
                            SiteMetricsDto,
                            SiteListQueryDto
                        >(
                            buildUrl('/metrics'),
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                                query,
                            },
                        );

                        logOk('getSiteMetrics', requestId, startedAt, {
                            ...meta,
                            totalCount: response.data?.total_count,
                            byRegionCount: response.data?.by_region?.length ?? 0,
                        });

                        return response.data;
                    } catch (error) {
                        logFail('getSiteMetrics', requestId, startedAt, error, meta);
                        throw error;
                    }
                },
            };
        },
    );
}