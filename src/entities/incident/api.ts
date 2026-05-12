// =====================
// entities/incident/api.ts
// =====================

import type {
    IncidentDto,
    IncidentListQueryDto,
    IncidentListResponseDto,
    IncidentMetricsDto,
    IncidentApiError,
    IncidentSortOption,
} from './types';

import {
    IncidentSortField,
    SortDirection,
} from './types';

import type {
    IncidentId,
    HttpClient,
    HttpClientRequestOptions,
} from '../../shared/api';

import {
    isAbortLikeError,
    isApiError,
    isHttpError,
    normalizeHttpError,
    createRestResourceClient,
} from '../../shared/api';

import { getGlobalLogger } from '../../shared/logging';

const logger = getGlobalLogger()
    .child('entities')
    .child('incident')
    .child('api');

export type IncidentApiRequestOptions = HttpClientRequestOptions;

type IncidentListQueryHttpDto =
    Omit<IncidentListQueryDto, 'sort'> & {
    sort?: string[];
};

const INCIDENT_SORT_FIELDS: readonly IncidentSortField[] = [
    IncidentSortField.CreatedAt,
    IncidentSortField.EventTime,
    IncidentSortField.Severity,
    IncidentSortField.Confidence,
    IncidentSortField.Site,
    IncidentSortField.Camera,
] as const;

const SORT_DIRECTIONS: readonly SortDirection[] = [
    SortDirection.Asc,
    SortDirection.Desc,
] as const;

function encodeSort(
    sort?: IncidentSortOption[],
): string[] | undefined {
    if (!sort || sort.length === 0) {
        return undefined;
    }

    const validFields = new Set(INCIDENT_SORT_FIELDS);
    const validDirections = new Set(SORT_DIRECTIONS);

    return sort
        .filter((item) =>
            validFields.has(item.field)
            && validDirections.has(item.direction),
        )
        .map((item) => `${item.field}:${item.direction}`);
}

function toIncidentListHttpQuery(
    query: IncidentListQueryDto,
): IncidentListQueryHttpDto {
    return {
        ...query,
        sort: encodeSort(query.sort),
    };
}

function normalizeBasePath(
    path: string,
): string {
    const normalized = String(path ?? '').trim();

    if (!normalized || normalized === '/') {
        return '';
    }

    const withLeadingSlash = normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;

    return withLeadingSlash.replace(/\/+$/, '');
}

function normalizeIncidentApiError(
    error: unknown,
): IncidentApiError {
    if (isAbortLikeError(error)) {
        return error as IncidentApiError;
    }

    if (isApiError(error) || isHttpError(error)) {
        return error as IncidentApiError;
    }

    return normalizeHttpError(error) as IncidentApiError;
}

function errorMeta(
    error: unknown,
): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return {
        message: String(error),
    };
}

function handleApiError(
    operation: string,
    error: unknown,
    meta?: Record<string, unknown>,
): never {
    if (isAbortLikeError(error)) {
        throw error;
    }

    const normalized = normalizeIncidentApiError(error);

    logger.error(`${operation}:error`, {
        ...(meta ?? {}),
        error: isApiError(normalized) || isHttpError(normalized)
            ? {
                message: (normalized as { message?: unknown }).message,
                code: (normalized as { code?: unknown }).code,
                status:
                    (normalized as { status?: unknown }).status
                    ?? (normalized as { statusCode?: unknown }).statusCode,
                payload: (normalized as { payload?: unknown }).payload,
                isCanceled: (normalized as { isCanceled?: unknown }).isCanceled,
            }
            : errorMeta(normalized),
    });

    throw normalized;
}

export interface IncidentApiClient {
    getIncidentById(
        id: IncidentId,
        options?: IncidentApiRequestOptions,
    ): Promise<IncidentDto>;

    getIncidentList(
        query: IncidentListQueryDto,
        options?: IncidentApiRequestOptions,
    ): Promise<IncidentListResponseDto>;

    getIncidentMetrics(
        query: IncidentListQueryDto,
        options?: IncidentApiRequestOptions,
    ): Promise<IncidentMetricsDto>;
}

export const INCIDENT_API_BASE_PATH = '/incidents';

export function createIncidentApiClient(
    httpClient: HttpClient,
    basePath: string = INCIDENT_API_BASE_PATH,
): IncidentApiClient {
    const rootPath = normalizeBasePath(basePath) || INCIDENT_API_BASE_PATH;

    return createRestResourceClient<IncidentApiClient>(
        { httpClient, basePath: rootPath },
        ({ httpClient: client, basePath: resolvedBasePath }) => {
            const buildUrl = (
                suffix: string = '',
            ): string => `${resolvedBasePath}${suffix}`;

            return {
                async getIncidentById(
                    id: IncidentId,
                    options?: IncidentApiRequestOptions,
                ): Promise<IncidentDto> {
                    const startedAt = Date.now();

                    logger.debug('getIncidentById:start', { id });

                    try {
                        const response = await client.get<IncidentDto>(
                            buildUrl(`/${id}`),
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                            },
                        );

                        logger.debug('getIncidentById:success', {
                            id,
                            ms: Date.now() - startedAt,
                        });

                        return response.data;
                    } catch (error) {
                        handleApiError('getIncidentById', error, {
                            id,
                            ms: Date.now() - startedAt,
                        });
                    }
                },

                async getIncidentList(
                    query: IncidentListQueryDto,
                    options?: IncidentApiRequestOptions,
                ): Promise<IncidentListResponseDto> {
                    const startedAt = Date.now();
                    const httpQuery = toIncidentListHttpQuery(query);

                    logger.debug('getIncidentList:start', {
                        page: query.page,
                        pageSize: query.pageSize,
                        sortCount: Array.isArray(query.sort)
                            ? query.sort.length
                            : 0,
                    });

                    try {
                        const response = await client.get<
                            IncidentListResponseDto,
                            IncidentListQueryHttpDto
                        >(
                            buildUrl(),
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                                query: httpQuery,
                            },
                        );

                        logger.debug('getIncidentList:success', {
                            ms: Date.now() - startedAt,
                            items: response.data?.items?.length ?? 0,
                            total: response.data?.meta?.total,
                        });

                        return response.data;
                    } catch (error) {
                        handleApiError('getIncidentList', error, {
                            ms: Date.now() - startedAt,
                            page: query.page,
                            pageSize: query.pageSize,
                        });
                    }
                },

                async getIncidentMetrics(
                    query: IncidentListQueryDto,
                    options?: IncidentApiRequestOptions,
                ): Promise<IncidentMetricsDto> {
                    const startedAt = Date.now();
                    const httpQuery = toIncidentListHttpQuery(query);

                    logger.debug('getIncidentMetrics:start', {
                        page: query.page,
                        pageSize: query.pageSize,
                        sortCount: Array.isArray(query.sort)
                            ? query.sort.length
                            : 0,
                    });

                    try {
                        const response = await client.get<
                            IncidentMetricsDto,
                            IncidentListQueryHttpDto
                        >(
                            buildUrl('/metrics'),
                            {
                                signal: options?.signal,
                                timeoutMs: options?.timeoutMs,
                                headers: options?.headers,
                                query: httpQuery,
                            },
                        );

                        logger.debug('getIncidentMetrics:success', {
                            ms: Date.now() - startedAt,
                            totalCount: response.data?.total_count,
                        });

                        return response.data;
                    } catch (error) {
                        handleApiError('getIncidentMetrics', error, {
                            ms: Date.now() - startedAt,
                        });
                    }
                },
            };
        },
    );
}