// =====================
// entities/incident/hooks.ts
// =====================

import { useMemo } from 'react';

import type {
    IncidentListQuery,
    IncidentApiError,
    IncidentListQueryDto,
} from './types';

import type {
    Incident,
    IncidentMetrics,
} from './model';

import {
    mapIncidentDtoToModel,
    mapIncidentListQueryToDto,
    mapIncidentMetricsQueryToDto,
    mapIncidentMetricsDtoToModel,
} from './mappers';

import type { UseQueryResult } from '@tanstack/react-query';
import {
    useQuery,
    keepPreviousData,
} from '@tanstack/react-query';

import type { IncidentId } from '../../shared/api';
import {
    isHttpError,
    isApiError,
    normalizeHttpError,
    useApiClient,
    isAbortLikeError,
} from '../../shared/api';

import { getGlobalLogger } from '../../shared/logging';

import type { IncidentApiClient } from './api';
import { createIncidentApiClient } from './api';

const logger = getGlobalLogger()
    .child('entities')
    .child('incident')
    .child('hooks');

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

function ensureIncidentApiError(
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

async function withOpLog<T>(
    level: 'debug' | 'info',
    operation: string,
    meta: Record<string, unknown> | undefined,
    action: () => Promise<T>,
): Promise<T> {
    const startedAt = Date.now();

    logger[level](`${operation}:start`, meta);

    try {
        const result = await action();

        logger[level](`${operation}:success`, {
            ...(meta ?? {}),
            ms: Date.now() - startedAt,
        });

        return result;
    } catch (error) {
        if (isAbortLikeError(error)) {
            throw error;
        }

        const isTransportError =
            isApiError(error) || isHttpError(error);

        if (!isTransportError) {
            logger.error(`${operation}:error`, {
                ...(meta ?? {}),
                ms: Date.now() - startedAt,
                error: errorMeta(error),
            });
        }

        throw ensureIncidentApiError(error);
    }
}

export interface UseIncidentQueryOptions {
    enabled?: boolean;
    refetchIntervalMs?: number | false;
}

export interface UseIncidentListQueryOptions {
    enabled?: boolean;
    keepPreviousData?: boolean;
}

export const incidentQueryKeys = {
    all: ['incidents'] as const,
    list: (dtoQuery: IncidentListQueryDto) =>
        ['incidents', 'list', dtoQuery] as const,
    details: (id: IncidentId) =>
        ['incidents', 'details', id] as const,
    metrics: (dtoQuery: IncidentListQueryDto) =>
        ['incidents', 'metrics', dtoQuery] as const,
};

function useIncidentApiClient(): IncidentApiClient {
    return useApiClient(createIncidentApiClient);
}

async function fetchIncidentById(
    client: IncidentApiClient,
    id: IncidentId,
    signal?: AbortSignal,
): Promise<Incident> {
    return withOpLog(
        'debug',
        'fetchIncidentById',
        { id },
        async () => {
            const dto = await client.getIncidentById(id, { signal });

            return mapIncidentDtoToModel(dto);
        },
    );
}

export function useIncidentQuery(
    id: IncidentId,
    options?: UseIncidentQueryOptions,
): UseQueryResult<Incident, IncidentApiError> {
    const client = useIncidentApiClient();
    const enabled = (options?.enabled ?? true) && Boolean(id);

    return useQuery<
        Incident,
        IncidentApiError,
        Incident,
        ReturnType<typeof incidentQueryKeys.details>
    >({
        queryKey: incidentQueryKeys.details(id),
        enabled,
        refetchInterval: options?.refetchIntervalMs ?? false,
        queryFn: ({ signal }) => fetchIncidentById(client, id, signal),
    });
}

export function useIncidentListQuery(
    query: IncidentListQuery,
    options?: UseIncidentListQueryOptions,
): UseQueryResult<
    { items: Incident[]; total: number },
    IncidentApiError
> {
    const client = useIncidentApiClient();

    const dtoQuery = useMemo(
        () => mapIncidentListQueryToDto(query),
        [query],
    );

    const enabled = options?.enabled ?? true;

    return useQuery<
        { items: Incident[]; total: number },
        IncidentApiError,
        { items: Incident[]; total: number },
        ReturnType<typeof incidentQueryKeys.list>
    >({
        queryKey: incidentQueryKeys.list(dtoQuery),
        enabled,
        placeholderData: options?.keepPreviousData
            ? keepPreviousData
            : undefined,
        queryFn: ({ signal }) =>
            withOpLog(
                'debug',
                'useIncidentListQuery:fetch',
                {
                    page: dtoQuery.page,
                    pageSize: dtoQuery.pageSize,
                },
                async () => {
                    const response = await client.getIncidentList(
                        dtoQuery,
                        { signal },
                    );

                    return {
                        items: response.items.map(mapIncidentDtoToModel),
                        total: response.meta.total,
                    };
                },
            ),
    });
}

export function useIncidentMetricsQuery(
    query: IncidentListQuery,
    options?: UseIncidentListQueryOptions,
): UseQueryResult<IncidentMetrics, IncidentApiError> {
    const client = useIncidentApiClient();

    const dtoQuery = useMemo(
        () => mapIncidentMetricsQueryToDto(query),
        [query],
    );

    const enabled = options?.enabled ?? true;

    return useQuery<
        IncidentMetrics,
        IncidentApiError,
        IncidentMetrics,
        ReturnType<typeof incidentQueryKeys.metrics>
    >({
        queryKey: incidentQueryKeys.metrics(dtoQuery),
        enabled,
        placeholderData: options?.keepPreviousData
            ? keepPreviousData
            : undefined,
        queryFn: ({ signal }) =>
            withOpLog(
                'debug',
                'useIncidentMetricsQuery:fetch',
                {
                    page: dtoQuery.page,
                    pageSize: dtoQuery.pageSize,
                },
                async () => {
                    const response = await client.getIncidentMetrics(
                        dtoQuery,
                        { signal },
                    );

                    return mapIncidentMetricsDtoToModel(response);
                },
            ),
    });
}