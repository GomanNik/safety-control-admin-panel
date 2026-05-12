// =====================
// File: src/entities/site/hooks.ts
// Purpose:
// - Queries and mutations for Site entity
// - Bulk site actions and active/inactive state are intentionally removed
// =====================

import { useMemo } from 'react';

import type {
    QueryClient,
    UseMutationResult,
    UseQueryResult,
} from '@tanstack/react-query';

import {
    keepPreviousData,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import type {
    SiteApiError,
    SiteListQuery,
    SiteListQueryDto,
} from './types';

import type {
    Site,
    SiteCreate,
    SitePatch,
} from './model';

import {
    mapSiteCreateModelToDto,
    mapSiteDtoToModel,
    mapSiteListQueryToDto,
    mapSitePatchModelToDto,
} from './mappers';

import {
    createSiteApiClient,
    type SiteApiClient,
} from './api';

import {
    createHttpError,
    HttpErrorCode,
    isAbortLikeError,
    isApiError,
    isHttpError,
    normalizeHttpError,
    useApiClient,
} from '../../shared/api';

import type { SiteId } from '../../shared/api';

import { getGlobalLogger } from '../../shared/logging';

export interface UseSiteQueryOptions {
    enabled?: boolean;
    refetchIntervalMs?: number | false;
}

export interface UseSiteListQueryOptions {
    enabled?: boolean;
    keepPreviousData?: boolean;
}

export interface UseSiteMutationOptions<TData, TVariables> {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: SiteApiError, variables: TVariables) => void;
    onSettled?: (
        data: TData | undefined,
        error: SiteApiError | null,
        variables: TVariables,
    ) => void;
}

export interface SiteCreateVariables {
    payload: SiteCreate;
}

export interface SitePatchVariables {
    siteId: SiteId;
    patch: SitePatch;
}

export interface SiteDeleteVariables {
    siteId: SiteId;
}

export const siteQueryKeys = {
    all: ['sites'] as const,
    list: (dtoQuery: SiteListQueryDto) =>
        ['sites', 'list', dtoQuery] as const,
    details: (id: SiteId | null | undefined) =>
        ['sites', 'details', id ?? null] as const,
};

function useSiteApiClient(): SiteApiClient {
    return useApiClient(createSiteApiClient);
}

const logger = getGlobalLogger()
    .child('entities')
    .child('site')
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

function isSiteApiErrorLike(
    error: unknown,
): error is SiteApiError {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const candidate = error as Record<string, unknown>;

    return (
        typeof candidate.code === 'string' &&
        typeof candidate.message === 'string'
    );
}

function ensureSiteApiError(
    error: unknown,
): SiteApiError {
    if (isAbortLikeError(error)) {
        return error as SiteApiError;
    }

    if (isApiError(error) || isHttpError(error)) {
        return error as SiteApiError;
    }

    if (isSiteApiErrorLike(error)) {
        return error;
    }

    return normalizeHttpError(error) as SiteApiError;
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

        throw ensureSiteApiError(error);
    }
}

const SITE_CREATE_ALLOWED_KEYS = new Set<string>([
    'name',
    'code',
    'timezone',
    'region',
    'address',
    'contact',
    'tags',
    'config',
]);

const SITE_PATCH_ALLOWED_KEYS = new Set<string>([
    'name',
    'code',
    'timezone',
    'region',
    'address',
    'contact',
    'tags',
    'config',
]);

function getUnknownKeys(
    value: object,
    allowedKeys: Set<string>,
): string[] {
    try {
        return Object.keys(value).filter(
            (key) => !allowedKeys.has(key),
        );
    } catch {
        return [];
    }
}

function createValidationError(
    message: string,
): SiteApiError {
    return createHttpError({
        message,
        code: HttpErrorCode.ValidationError,
    }) as SiteApiError;
}

function toSiteCreateDto(
    payload: SiteCreate,
) {
    const normalizedName = String(payload.name ?? '').trim();

    if (!normalizedName) {
        throw createValidationError('Site name is required');
    }

    const unknownKeys = getUnknownKeys(
        payload,
        SITE_CREATE_ALLOWED_KEYS,
    );

    if (unknownKeys.length > 0) {
        logger.warn('site create payload contains unknown keys', {
            unknownKeys,
        });
    }

    return {
        ...mapSiteCreateModelToDto(payload),
        name: normalizedName,
    };
}

function toSitePatchDto(
    patch: SitePatch,
) {
    const unknownKeys = getUnknownKeys(
        patch,
        SITE_PATCH_ALLOWED_KEYS,
    );

    if (unknownKeys.length > 0) {
        logger.warn('site patch contains unknown keys', {
            unknownKeys,
        });
    }

    if (
        patch.name !== undefined &&
        String(patch.name ?? '').trim().length === 0
    ) {
        throw createValidationError('Site name cannot be empty');
    }

    const dto = mapSitePatchModelToDto(patch);

    if (Object.keys(dto).length === 0) {
        throw createValidationError('Empty patch: nothing to update');
    }

    return dto;
}

const LIST_AFFECTING_PATCH_KEYS = new Set<keyof SitePatch>([
    'name',
    'code',
    'region',
    'tags',
]);

function shouldInvalidateLists(
    patch: SitePatch,
): boolean {
    try {
        return (Object.keys(patch) as (keyof SitePatch)[]).some(
            (key) => LIST_AFFECTING_PATCH_KEYS.has(key),
        );
    } catch {
        return true;
    }
}

function updateSiteCaches(
    queryClient: QueryClient,
    updatedSite: Site,
    options?: {
        invalidateLists?: boolean;
    },
): void {
    const siteId = updatedSite.id;

    queryClient.setQueryData<Site | undefined>(
        siteQueryKeys.details(siteId),
        updatedSite,
    );

    const listQueries = queryClient.getQueriesData<{
        items: Site[];
        total: number;
    }>({
        queryKey: ['sites', 'list'],
    });

    for (const [queryKey, data] of listQueries) {
        if (!data) {
            continue;
        }

        const itemIndex = data.items.findIndex(
            (item) => item.id === siteId,
        );

        if (itemIndex < 0) {
            continue;
        }

        const nextItems = data.items.slice();
        nextItems[itemIndex] = updatedSite;

        queryClient.setQueryData(queryKey, {
            ...data,
            items: nextItems,
        });
    }

    if (options?.invalidateLists) {
        void queryClient.invalidateQueries({
            queryKey: ['sites', 'list'],
        });
    }
}

function insertCreatedSiteIntoCaches(
    queryClient: QueryClient,
    createdSite: Site,
): void {
    queryClient.setQueryData<Site | undefined>(
        siteQueryKeys.details(createdSite.id),
        createdSite,
    );

    void queryClient.invalidateQueries({
        queryKey: ['sites', 'list'],
    });
}

function removeDeletedSiteFromCaches(
    queryClient: QueryClient,
    siteId: SiteId,
): void {
    queryClient.removeQueries({
        queryKey: siteQueryKeys.details(siteId),
        exact: true,
    });

    const listQueries = queryClient.getQueriesData<{
        items: Site[];
        total: number;
    }>({
        queryKey: ['sites', 'list'],
    });

    for (const [queryKey, data] of listQueries) {
        if (!data) {
            continue;
        }

        const nextItems = data.items.filter(
            (item) => item.id !== siteId,
        );

        if (nextItems.length === data.items.length) {
            continue;
        }

        queryClient.setQueryData(queryKey, {
            ...data,
            items: nextItems,
            total: Math.max(0, data.total - 1),
        });
    }

    void queryClient.invalidateQueries({
        queryKey: ['sites', 'list'],
    });
}

export function useSiteQuery(
    id: SiteId | null | undefined,
    options?: UseSiteQueryOptions,
): UseQueryResult<Site, SiteApiError> {
    const client = useSiteApiClient();
    const enabled = (options?.enabled ?? true) && Boolean(id);

    return useQuery<Site, SiteApiError>({
        queryKey: siteQueryKeys.details(id),
        enabled,
        refetchInterval: options?.refetchIntervalMs ?? false,
        queryFn: ({ signal }) =>
            withOpLog(
                'debug',
                'useSiteQuery:fetch',
                { siteId: id ?? null },
                async () => {
                    if (!id) {
                        throw createValidationError('Site id is required');
                    }

                    const dto = await client.getSiteById(id, { signal });
                    return mapSiteDtoToModel(dto);
                },
            ),
    });
}

export function useSiteListQuery(
    query: SiteListQuery,
    options?: UseSiteListQueryOptions,
): UseQueryResult<{ items: Site[]; total: number }, SiteApiError> {
    const client = useSiteApiClient();

    const dtoQuery = useMemo(
        () => mapSiteListQueryToDto(query),
        [query],
    );

    return useQuery<{ items: Site[]; total: number }, SiteApiError>({
        queryKey: siteQueryKeys.list(dtoQuery),
        enabled: options?.enabled ?? true,
        placeholderData: options?.keepPreviousData
            ? keepPreviousData
            : undefined,
        queryFn: ({ signal }) =>
            withOpLog(
                'debug',
                'useSiteListQuery:fetch',
                {
                    page: dtoQuery.page,
                    pageSize: dtoQuery.pageSize,
                },
                async () => {
                    const response = await client.getSiteList(
                        dtoQuery,
                        { signal },
                    );

                    return {
                        items: response.items.map(mapSiteDtoToModel),
                        total: response.meta.total,
                    };
                },
            ),
    });
}

export function useSiteCreateMutation(
    options?: UseSiteMutationOptions<Site, SiteCreateVariables>,
): UseMutationResult<Site, SiteApiError, SiteCreateVariables> {
    const client = useSiteApiClient();
    const queryClient = useQueryClient();

    return useMutation<Site, SiteApiError, SiteCreateVariables>({
        mutationFn: async (variables) => {
            const createDto = toSiteCreateDto(variables.payload);

            return withOpLog(
                'info',
                'useSiteCreateMutation',
                {
                    payloadKeys: Object.keys(variables.payload ?? {}),
                    name: variables.payload?.name,
                },
                async () => {
                    const dto = await client.createSite(createDto);
                    return mapSiteDtoToModel(dto);
                },
            );
        },
        onSuccess: (data, variables) => {
            insertCreatedSiteIntoCaches(queryClient, data);

            options?.onSuccess?.(data, variables);
            options?.onSettled?.(data, null, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
            options?.onSettled?.(undefined, error, variables);
        },
    });
}

export function useSitePatchMutation(
    options?: UseSiteMutationOptions<Site, SitePatchVariables>,
): UseMutationResult<Site, SiteApiError, SitePatchVariables> {
    const client = useSiteApiClient();
    const queryClient = useQueryClient();

    return useMutation<Site, SiteApiError, SitePatchVariables>({
        mutationFn: async (variables) => {
            const patchDto = toSitePatchDto(variables.patch);

            return withOpLog(
                'info',
                'useSitePatchMutation',
                {
                    siteId: variables.siteId,
                    patchKeys: Object.keys(variables.patch ?? {}),
                },
                async () => {
                    const dto = await client.patchSite(
                        variables.siteId,
                        patchDto,
                    );

                    return mapSiteDtoToModel(dto);
                },
            );
        },
        onSuccess: (data, variables) => {
            updateSiteCaches(queryClient, data, {
                invalidateLists: shouldInvalidateLists(variables.patch),
            });

            options?.onSuccess?.(data, variables);
            options?.onSettled?.(data, null, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
            options?.onSettled?.(undefined, error, variables);
        },
    });
}

export function useSiteDeleteMutation(
    options?: UseSiteMutationOptions<void, SiteDeleteVariables>,
): UseMutationResult<void, SiteApiError, SiteDeleteVariables> {
    const client = useSiteApiClient();
    const queryClient = useQueryClient();

    return useMutation<void, SiteApiError, SiteDeleteVariables>({
        mutationFn: async (variables) => {
            return withOpLog(
                'info',
                'useSiteDeleteMutation',
                {
                    siteId: variables.siteId,
                },
                async () => {
                    await client.deleteSite(variables.siteId);
                },
            );
        },
        onSuccess: (_data, variables) => {
            removeDeletedSiteFromCaches(queryClient, variables.siteId);

            options?.onSuccess?.(undefined, variables);
            options?.onSettled?.(undefined, null, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
            options?.onSettled?.(undefined, error, variables);
        },
    });
}