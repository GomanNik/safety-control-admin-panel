// =====================
// File: src/entities/camera/hooks.ts
// Purpose:
//   React Query hooks and realtime orchestration for camera domain.
//   Camera stays a single domain and now supports:
//   - camera list / details
//   - count by site
//   - connection check / create / delete
//   - legacy stream query
//   - video capabilities
//   - live session lifecycle
//   - playback session mutations
//   - camera and video realtime subscriptions
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type {
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
    CameraApiError,
    CameraConnectionCheckRequestDto,
    CameraCreateDto,
    CameraListQuery,
    CameraListQueryDto,
    CameraVideoMode,
    CameraVideoProfile,
    CameraVideoStreamQuery,
    CreateCameraLiveSessionDto,
    CreateCameraPlaybackSessionDto,
} from './types';

import { subscribeMockRealtimeEvent } from '../../shared/realtime/mock-bridge';

import type {
    Camera,
    CameraConnectionCheckResult,
    CameraLiveSession,
    CameraPlaybackSession,
    CameraVideoCapabilities,
    CameraVideoStream,
} from './model';

import {
    mapCameraConnectionCheckResponseToModel,
    mapCameraDtoToModel,
    mapCameraListQueryToDto,
    mapCameraLiveSessionDtoToModel,
    mapCameraPlaybackSessionDtoToModel,
    mapCameraVideoCapabilitiesDtoToModel,
    mapCameraVideoStreamDtoToModel,
} from './mappers';
import type { CameraApiClient } from './api';
import { createCameraApiClient } from './api';

import type {
    CameraId,
    SiteId,
} from '../../shared/api';
import {
    isAbortLikeError,
    isApiError,
    isHttpError,
    normalizeHttpError,
    useApiClient,
} from '../../shared/api';

import type { RealtimeEvent } from '../../shared/realtime';
import { useRealtimeClient } from '../../shared/realtime';

import {
    CAMERA_REALTIME_CHANNEL,
    CAMERA_REALTIME_EVENT_TYPES,
    CAMERA_VIDEO_REALTIME_CHANNEL,
    CAMERA_VIDEO_REALTIME_EVENT_TYPES,
    extractCameraDtoFromRealtimePayload,
    extractCameraVideoRealtimePayload,
    isCameraRealtimeEventType,
    isCameraVideoRealtimeEventType,
    type CameraRealtimeEventPayload,
    type CameraRealtimeEventType,
    type CameraRealtimeInboundPayload,
    type CameraVideoRealtimeEventPayload,
    type CameraVideoRealtimeEventType,
    type CameraVideoRealtimeInboundPayload,
} from './realtime-contract';

import {
    isCameraLiveSessionExpired,
    resolveCameraVideoProfileForUsage,
} from './model';
import { getGlobalLogger } from '../../shared/logging';

const logger = getGlobalLogger()
    .child('entities')
    .child('camera')
    .child('hooks');

const now = (): number => Date.now();

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

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function ensureCameraApiError(
    error: unknown,
): CameraApiError {
    if (isAbortLikeError(error)) {
        return error as CameraApiError;
    }

    if (isApiError(error) || isHttpError(error)) {
        return error as CameraApiError;
    }

    return normalizeHttpError(error) as CameraApiError;
}

export interface CameraListResult {
    items: Camera[];
    total: number;
}

export interface CameraCountBySiteService {
    getCameraCountBySite(siteId: SiteId): Promise<number>;
}

const CAMERA_SITE_COUNT_PAGE_SIZE = 1;

function buildCameraCountBySiteQuery(
    siteId: SiteId,
): CameraListQuery {
    return {
        filters: {
            siteId,
        },
        pagination: {
            page: 1,
            pageSize: CAMERA_SITE_COUNT_PAGE_SIZE,
        },
    };
}

function normalizeCameraCount(
    value: unknown,
): number {
    const numeric = typeof value === 'number'
        ? value
        : Number(value);

    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Math.max(0, Math.trunc(numeric));
}

export const getCameraCountBySiteQueryKey = (
    siteId: SiteId,
) => cameraQueryKeys.siteCount(siteId);

export async function fetchCameraCountBySite(
    client: Pick<CameraApiClient, 'getCameraList'>,
    siteId: SiteId,
): Promise<number> {
    try {
        const response = await client.getCameraList(
            mapCameraListQueryToDto(
                buildCameraCountBySiteQuery(siteId),
            ),
        );

        return normalizeCameraCount(
            response.meta?.total ?? response.items?.length ?? 0,
        );
    } catch (error) {
        throw ensureCameraApiError(error);
    }
}

export function useCameraCountBySiteService(): CameraCountBySiteService {
    const client = useCameraApiClient();

    return useMemo<CameraCountBySiteService>(
        () => ({
            getCameraCountBySite(siteId: SiteId): Promise<number> {
                return fetchCameraCountBySite(client, siteId);
            },
        }),
        [client],
    );
}

export interface CameraRealtimeQuerySyncResult {
    query: CameraListQuery;
    lastUpdatedAt?: Date;
}

export interface CameraVideoRealtimeSubscriptionFilters {
    cameraId?: CameraId;
    sessionId?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
}

export interface UseCameraQueryOptions {
    enabled?: boolean;
    refetchIntervalMs?: number | false;
}

export interface UseCameraListQueryOptions {
    enabled?: boolean;
    keepPreviousData?: boolean;
}

export interface UseCameraVideoStreamQueryOptions {
    enabled?: boolean;
    refetchIntervalMs?: number | false;
}

export interface UseCameraVideoCapabilitiesQueryOptions {
    enabled?: boolean;
    refetchIntervalMs?: number | false;
}

export interface UseCameraMutationOptions<TData, TVariables> {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: CameraApiError, variables: TVariables) => void;
    onSettled?: (
        data: TData | undefined,
        error: CameraApiError | null,
        variables: TVariables,
    ) => void;
}

export type CameraCapabilityStatus =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'failed';

export type CameraSessionStatus =
    | 'idle'
    | 'creating'
    | 'ready'
    | 'failed'
    | 'expired';

export interface UseCameraLiveSessionOptions {
    cameraId?: CameraId | null;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
    usage?: 'grid' | 'details';
    enabled?: boolean;
    keepAliveIntervalMs?: number;
}

export interface CameraLiveSessionView {
    capabilities: CameraVideoCapabilities | null;
    capabilityStatus: CameraCapabilityStatus;
    effectiveProfile: CameraVideoProfile | null;

    session: CameraLiveSession | null;
    sessionStatus: CameraSessionStatus;

    isLoading: boolean;
    error: CameraApiError | null;

    refresh(): Promise<void>;
    reconnect(): Promise<void>;
    close(): Promise<void>;
}

export const cameraQueryKeys = {
    all: ['cameras'] as const,

    list: (dtoQuery: CameraListQueryDto) =>
        ['cameras', 'list', dtoQuery] as const,

    details: (id: CameraId) =>
        ['cameras', 'details', id] as const,

    siteCount: (siteId: SiteId) => [
        'cameras',
        'site-count',
        siteId,
    ] as const,

    siteCountRoot: ['cameras', 'site-count'] as const,

    connectionChecks: ['cameras', 'connection-checks'] as const,

    videoStreamByCamera: (cameraId: CameraId) =>
        ['cameras', 'video', 'stream', cameraId] as const,

    videoStream: (
        cameraId: CameraId,
        mode?: CameraVideoMode,
    ) => [
        'cameras',
        'video',
        'stream',
        cameraId,
        mode ?? null,
    ] as const,

    videoCapabilities: (cameraId: CameraId) => [
        'cameras',
        'video',
        'capabilities',
        cameraId,
    ] as const,

    liveSessionRootByCamera: (cameraId: CameraId) => [
        'cameras',
        'video',
        'live-session',
        cameraId,
    ] as const,

    liveSession: (
        cameraId: CameraId,
        mode: CameraVideoMode,
        profile: CameraVideoProfile,
    ) => [
        'cameras',
        'video',
        'live-session',
        cameraId,
        mode,
        profile,
    ] as const,

    playbackSessionRootByCamera: (cameraId: CameraId) => [
        'cameras',
        'video',
        'playback-session',
        cameraId,
    ] as const,

    playbackSession: (
        cameraId: CameraId,
        from: string,
        to: string,
    ) => [
        'cameras',
        'video',
        'playback-session',
        cameraId,
        from,
        to,
    ] as const,

    overlayRoot: ['cameras', 'video', 'overlay'] as const,

    overlay: (
        cameraId: CameraId,
        sessionId: string,
    ) => [
        'cameras',
        'video',
        'overlay',
        cameraId,
        sessionId,
    ] as const,
};

function useCameraApiClient(): CameraApiClient {
    return useApiClient(createCameraApiClient);
}

function matchesCameraRealtimeFilters(
    camera: Camera,
    query?: Partial<CameraListQuery>,
): boolean {
    if (!query) {
        return true;
    }

    const filtersCandidate: unknown = query.filters ?? query;

    if (!isRecord(filtersCandidate)) {
        return true;
    }

    const filters = filtersCandidate as Record<string, unknown>;

    if (
        typeof filters.siteId === 'string' &&
        camera.siteId !== filters.siteId
    ) {
        return false;
    }

    if (
        Array.isArray(filters.statuses) &&
        filters.statuses.length > 0 &&
        !filters.statuses.includes(camera.status)
    ) {
        return false;
    }

    if (typeof filters.search === 'string') {
        const search = filters.search.toLowerCase().trim();

        if (search) {
            const haystack = [
                camera.id,
                camera.name,
                camera.location,
                camera.vendor,
                camera.model,
                camera.serialNumber,
                camera.siteId,
                camera.siteName,
                camera.sourceSummary?.host,
                camera.sourceSummary?.path,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            if (!haystack.includes(search)) {
                return false;
            }
        }
    }

    return true;
}

function matchesCameraVideoRealtimeFilters(
    event: CameraVideoRealtimeEventPayload,
    filters?: CameraVideoRealtimeSubscriptionFilters,
): boolean {
    if (!filters) {
        return true;
    }

    if (filters.cameraId && event.cameraId !== filters.cameraId) {
        return false;
    }

    if (filters.sessionId && event.sessionId !== filters.sessionId) {
        return false;
    }

    if (filters.mode && event.mode !== filters.mode) {
        return false;
    }

    return !(filters.profile && event.profile !== filters.profile);
}

function patchCameraInListCache(
    queryClient: ReturnType<typeof useQueryClient>,
    dtoQuery: CameraListQueryDto,
    camera: Camera,
): boolean {
    let patched = false;

    queryClient.setQueryData<CameraListResult>(
        cameraQueryKeys.list(dtoQuery),
        (previous) => {
            if (!previous) {
                return previous;
            }

            const itemIndex = previous.items.findIndex(
                (item) => item.id === camera.id,
            );

            if (itemIndex < 0) {
                return previous;
            }

            patched = true;

            const nextItems = previous.items.slice();
            nextItems[itemIndex] = camera;

            return {
                ...previous,
                items: nextItems,
            };
        },
    );

    return patched;
}

function invalidateCameraVideoCaches(
    queryClient: ReturnType<typeof useQueryClient>,
    cameraId: CameraId,
): void {
    void queryClient.invalidateQueries({
        queryKey: cameraQueryKeys.videoCapabilities(cameraId),
    });

    void queryClient.invalidateQueries({
        queryKey: cameraQueryKeys.videoStreamByCamera(cameraId),
    });

    void queryClient.invalidateQueries({
        queryKey: cameraQueryKeys.liveSessionRootByCamera(cameraId),
    });

    void queryClient.invalidateQueries({
        queryKey: cameraQueryKeys.playbackSessionRootByCamera(cameraId),
    });

    void queryClient.invalidateQueries({
        queryKey: cameraQueryKeys.overlayRoot,
    });
}

function resolveCapabilityStatus(args: {
    enabled: boolean;
    isLoading: boolean;
    isError: boolean;
    hasData: boolean;
}): CameraCapabilityStatus {
    if (!args.enabled) {
        return 'idle';
    }

    if (args.isLoading && !args.hasData) {
        return 'loading';
    }

    if (args.isError) {
        return 'failed';
    }

    return args.hasData
        ? 'ready'
        : 'idle';
}

function pickDefaultProfile(args: {
    capabilities: CameraVideoCapabilities | null;
    mode: CameraVideoMode;
    usage: 'grid' | 'details';
    requestedProfile?: CameraVideoProfile;
}): CameraVideoProfile | null {
    const {
        capabilities,
        mode,
        usage,
        requestedProfile,
    } = args;

    if (requestedProfile) {
        return requestedProfile;
    }

    if (!capabilities) {
        return resolveCameraVideoProfileForUsage({
            usage,
            mode,
        });
    }

    const preferred = usage === 'grid'
        ? capabilities.preferredGridProfile
        : capabilities.preferredSingleProfile;

    if (
        capabilities.profiles.includes(preferred) &&
        (
            (mode === 'processed' && preferred.startsWith('processed_')) ||
            (mode === 'original' && !preferred.startsWith('processed_'))
        )
    ) {
        return preferred;
    }

    const fallbackByUsage = resolveCameraVideoProfileForUsage({
        usage,
        mode,
    });

    if (capabilities.profiles.includes(fallbackByUsage)) {
        return fallbackByUsage;
    }

    const firstMatching = capabilities.profiles.find((item) =>
        mode === 'processed'
            ? item.startsWith('processed_')
            : !item.startsWith('processed_'),
    );

    return firstMatching ?? capabilities.profiles[0] ?? null;
}

export function useCameraQuery(
    id: CameraId,
    options?: UseCameraQueryOptions,
): UseQueryResult<Camera, CameraApiError> {
    const client = useCameraApiClient();

    const enabled = (options?.enabled ?? true) && Boolean(id);

    return useQuery<Camera, CameraApiError>({
        queryKey: cameraQueryKeys.details(id),
        enabled,
        refetchInterval: options?.refetchIntervalMs ?? false,
        queryFn: async ({ signal }) => {
            try {
                const dto = await client.getCameraById(id, { signal });
                return mapCameraDtoToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
    });
}

export function useCameraListQuery(
    query: CameraListQuery,
    options?: UseCameraListQueryOptions,
): UseQueryResult<CameraListResult, CameraApiError> {
    const client = useCameraApiClient();

    const dtoQuery = useMemo(
        () => mapCameraListQueryToDto(query),
        [query],
    );

    return useQuery<CameraListResult, CameraApiError>({
        queryKey: cameraQueryKeys.list(dtoQuery),
        enabled: options?.enabled ?? true,
        placeholderData: options?.keepPreviousData
            ? keepPreviousData
            : undefined,
        queryFn: async ({ signal }) => {
            try {
                const response = await client.getCameraList(
                    dtoQuery,
                    { signal },
                );

                return {
                    items: response.items.map(mapCameraDtoToModel),
                    total: response.meta.total,
                };
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
    });
}

export function useCameraVideoStreamQuery(
    query: CameraVideoStreamQuery,
    options?: UseCameraVideoStreamQueryOptions,
): UseQueryResult<CameraVideoStream, CameraApiError> {
    const client = useCameraApiClient();

    const enabled = (options?.enabled ?? true) && Boolean(query.cameraId);

    return useQuery<CameraVideoStream, CameraApiError>({
        queryKey: cameraQueryKeys.videoStream(
            query.cameraId,
            query.mode,
        ),
        enabled,
        refetchInterval: options?.refetchIntervalMs ?? false,
        queryFn: async ({ signal }) => {
            try {
                const dto = await client.getCameraVideoStream(
                    query,
                    { signal },
                );

                return mapCameraVideoStreamDtoToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
    });
}

export function useCameraVideoCapabilitiesQuery(
    cameraId: CameraId,
    options?: UseCameraVideoCapabilitiesQueryOptions,
): UseQueryResult<CameraVideoCapabilities, CameraApiError> {
    const client = useCameraApiClient();

    const enabled = (options?.enabled ?? true) && Boolean(cameraId);

    return useQuery<CameraVideoCapabilities, CameraApiError>({
        queryKey: cameraQueryKeys.videoCapabilities(cameraId),
        enabled,
        refetchInterval: options?.refetchIntervalMs ?? false,
        queryFn: async ({ signal }) => {
            try {
                const dto = await client.getCameraVideoCapabilities(
                    cameraId,
                    { signal },
                );

                return mapCameraVideoCapabilitiesDtoToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
    });
}

export function useCameraConnectionCheckMutation(
    options?: UseCameraMutationOptions<
        CameraConnectionCheckResult,
        CameraConnectionCheckRequestDto
    >,
): UseMutationResult<
    CameraConnectionCheckResult,
    CameraApiError,
    CameraConnectionCheckRequestDto
> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<
        CameraConnectionCheckResult,
        CameraApiError,
        CameraConnectionCheckRequestDto
    >({
        mutationFn: async (payload) => {
            try {
                const dto = await client.checkCameraConnection(payload);
                return mapCameraConnectionCheckResponseToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (data, variables) => {
            queryClient.setQueryData(
                [...cameraQueryKeys.connectionChecks, data.checkToken ?? null],
                data,
            );

            options?.onSuccess?.(data, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
        },
        onSettled: (data, error, variables) => {
            options?.onSettled?.(
                data,
                error ?? null,
                variables,
            );
        },
    });
}

export function useCameraCreateMutation(
    options?: UseCameraMutationOptions<Camera, CameraCreateDto>,
): UseMutationResult<Camera, CameraApiError, CameraCreateDto> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<Camera, CameraApiError, CameraCreateDto>({
        mutationFn: async (payload) => {
            try {
                const dto = await client.createCamera(payload);
                return mapCameraDtoToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (data, variables) => {
            queryClient.setQueryData(
                cameraQueryKeys.details(data.id),
                data,
            );

            void queryClient.invalidateQueries({
                queryKey: cameraQueryKeys.all,
            });

            void queryClient.invalidateQueries({
                queryKey: cameraQueryKeys.siteCountRoot,
            });

            options?.onSuccess?.(data, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
        },
        onSettled: (data, error, variables) => {
            options?.onSettled?.(
                data,
                error ?? null,
                variables,
            );
        },
    });
}

export function useCameraDeleteMutation(
    options?: UseCameraMutationOptions<void, CameraId>,
): UseMutationResult<void, CameraApiError, CameraId> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<void, CameraApiError, CameraId>({
        mutationFn: async (cameraId) => {
            try {
                await client.deleteCamera(cameraId);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (_data, cameraId) => {
            queryClient.removeQueries({
                queryKey: cameraQueryKeys.details(cameraId),
            });

            queryClient.removeQueries({
                queryKey: cameraQueryKeys.videoStreamByCamera(cameraId),
            });

            queryClient.removeQueries({
                queryKey: cameraQueryKeys.videoCapabilities(cameraId),
            });

            queryClient.removeQueries({
                queryKey: cameraQueryKeys.liveSessionRootByCamera(cameraId),
            });

            queryClient.removeQueries({
                queryKey: cameraQueryKeys.playbackSessionRootByCamera(cameraId),
            });

            void queryClient.invalidateQueries({
                queryKey: cameraQueryKeys.all,
            });

            void queryClient.invalidateQueries({
                queryKey: cameraQueryKeys.siteCountRoot,
            });

            options?.onSuccess?.(undefined, cameraId);
        },
        onError: (error, cameraId) => {
            options?.onError?.(error, cameraId);
        },
        onSettled: (data, error, cameraId) => {
            options?.onSettled?.(
                data,
                error ?? null,
                cameraId,
            );
        },
    });
}

type CreateLiveSessionVariables = {
    cameraId: CameraId;
    payload: CreateCameraLiveSessionDto;
};

type KeepAliveLiveSessionVariables = {
    cameraId: CameraId;
    sessionId: string;
};

type DeleteLiveSessionVariables = {
    cameraId: CameraId;
    sessionId: string;
};

type CreatePlaybackSessionVariables = {
    cameraId: CameraId;
    payload: CreateCameraPlaybackSessionDto;
};

type DeletePlaybackSessionVariables = {
    cameraId: CameraId;
    sessionId: string;
};

export function useCameraCreateLiveSessionMutation(
    options?: UseCameraMutationOptions<CameraLiveSession, CreateLiveSessionVariables>,
): UseMutationResult<CameraLiveSession, CameraApiError, CreateLiveSessionVariables> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<CameraLiveSession, CameraApiError, CreateLiveSessionVariables>({
        mutationFn: async (variables) => {
            try {
                const dto = await client.createCameraLiveSession(
                    variables.cameraId,
                    variables.payload,
                );

                return mapCameraLiveSessionDtoToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (data, variables) => {
            queryClient.setQueryData(
                cameraQueryKeys.liveSession(
                    variables.cameraId,
                    variables.payload.mode,
                    variables.payload.profile,
                ),
                data,
            );

            options?.onSuccess?.(data, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
        },
        onSettled: (data, error, variables) => {
            options?.onSettled?.(
                data,
                error ?? null,
                variables,
            );
        },
    });
}

export function useCameraKeepAliveLiveSessionMutation(
    options?: UseCameraMutationOptions<CameraLiveSession, KeepAliveLiveSessionVariables>,
): UseMutationResult<CameraLiveSession, CameraApiError, KeepAliveLiveSessionVariables> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<CameraLiveSession, CameraApiError, KeepAliveLiveSessionVariables>({
        mutationFn: async (variables) => {
            try {
                const dto = await client.keepAliveCameraLiveSession(
                    variables.cameraId,
                    variables.sessionId,
                );

                return mapCameraLiveSessionDtoToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (data, variables) => {
            queryClient.setQueriesData<CameraLiveSession>(
                {
                    queryKey: cameraQueryKeys.liveSessionRootByCamera(
                        variables.cameraId,
                    ),
                },
                (previous) => {
                    if (!previous) {
                        return previous;
                    }

                    return previous.sessionId === variables.sessionId
                        ? data
                        : previous;
                },
            );

            options?.onSuccess?.(data, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
        },
        onSettled: (data, error, variables) => {
            options?.onSettled?.(
                data,
                error ?? null,
                variables,
            );
        },
    });
}

export function useCameraDeleteLiveSessionMutation(
    options?: UseCameraMutationOptions<void, DeleteLiveSessionVariables>,
): UseMutationResult<void, CameraApiError, DeleteLiveSessionVariables> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<void, CameraApiError, DeleteLiveSessionVariables>({
        mutationFn: async (variables) => {
            try {
                await client.deleteCameraLiveSession(
                    variables.cameraId,
                    variables.sessionId,
                );
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (_data, variables) => {
            queryClient.removeQueries({
                queryKey: cameraQueryKeys.liveSessionRootByCamera(
                    variables.cameraId,
                ),
            });

            options?.onSuccess?.(undefined, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
        },
        onSettled: (data, error, variables) => {
            options?.onSettled?.(
                data,
                error ?? null,
                variables,
            );
        },
    });
}

export function useCameraCreatePlaybackSessionMutation(
    options?: UseCameraMutationOptions<CameraPlaybackSession, CreatePlaybackSessionVariables>,
): UseMutationResult<CameraPlaybackSession, CameraApiError, CreatePlaybackSessionVariables> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<CameraPlaybackSession, CameraApiError, CreatePlaybackSessionVariables>({
        mutationFn: async (variables) => {
            try {
                const dto = await client.createCameraPlaybackSession(
                    variables.cameraId,
                    variables.payload,
                );

                return mapCameraPlaybackSessionDtoToModel(dto);
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (data, variables) => {
            queryClient.setQueryData(
                cameraQueryKeys.playbackSession(
                    variables.cameraId,
                    variables.payload.from,
                    variables.payload.to,
                ),
                data,
            );

            options?.onSuccess?.(data, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
        },
        onSettled: (data, error, variables) => {
            options?.onSettled?.(
                data,
                error ?? null,
                variables,
            );
        },
    });
}

export function useCameraDeletePlaybackSessionMutation(
    options?: UseCameraMutationOptions<void, DeletePlaybackSessionVariables>,
): UseMutationResult<void, CameraApiError, DeletePlaybackSessionVariables> {
    const client = useCameraApiClient();
    const queryClient = useQueryClient();

    return useMutation<void, CameraApiError, DeletePlaybackSessionVariables>({
        mutationFn: async (variables) => {
            try {
                await client.deleteCameraPlaybackSession(
                    variables.cameraId,
                    variables.sessionId,
                );
            } catch (error) {
                throw ensureCameraApiError(error);
            }
        },
        onSuccess: (_data, variables) => {
            queryClient.removeQueries({
                queryKey: cameraQueryKeys.playbackSessionRootByCamera(
                    variables.cameraId,
                ),
            });

            options?.onSuccess?.(undefined, variables);
        },
        onError: (error, variables) => {
            options?.onError?.(error, variables);
        },
        onSettled: (data, error, variables) => {
            options?.onSettled?.(
                data,
                error ?? null,
                variables,
            );
        },
    });
}

function useCameraRealtimeRawSubscription(
    enabled: boolean,
    onEvent?: (event: CameraRealtimeEventPayload) => void,
): void {
    const realtimeClient = useRealtimeClient();
    const onEventRef = useRef(onEvent);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const requestId = `cameraRealtimeSub:${now()}`;

        const unsubscribeMock = subscribeMockRealtimeEvent(
            (mockEvent) => {
                if (mockEvent.channel !== CAMERA_REALTIME_CHANNEL) {
                    return;
                }

                try {
                    const payload = isRecord(mockEvent.payload)
                        ? mockEvent.payload
                        : null;

                    const typeFromEvent = isCameraRealtimeEventType(mockEvent.type)
                        ? mockEvent.type as CameraRealtimeEventType
                        : undefined;

                    const extracted = extractCameraDtoFromRealtimePayload(payload);
                    const type = typeFromEvent ?? extracted.type;
                    const cameraDto = extracted.camera;

                    if (!type || !cameraDto) {
                        return;
                    }

                    onEventRef.current?.({
                        type,
                        camera: mapCameraDtoToModel(cameraDto),
                        timestamp: mockEvent.timestamp,
                        channel: mockEvent.channel,
                    });
                } catch (error) {
                    logger.warn('camera mock realtime handler error', {
                        requestId,
                        channel: mockEvent.channel,
                        error: safePreview(error),
                    });
                }
            },
        );

        if (!realtimeClient) {
            return () => {
                unsubscribeMock();
            };
        }

        logger.debug('camera realtime subscribe', {
            requestId,
            channel: CAMERA_REALTIME_CHANNEL,
        });

        const handler = (
            realtimeEvent: RealtimeEvent<CameraRealtimeInboundPayload>,
        ) => {
            try {
                const typeFromEvent = isCameraRealtimeEventType(realtimeEvent.type)
                    ? realtimeEvent.type as CameraRealtimeEventType
                    : undefined;

                const extracted = extractCameraDtoFromRealtimePayload(
                    realtimeEvent.payload,
                );

                const type = typeFromEvent ?? extracted.type;

                if (!type || !extracted.camera) {
                    return;
                }

                onEventRef.current?.({
                    type,
                    camera: mapCameraDtoToModel(extracted.camera),
                    timestamp: typeof realtimeEvent.timestamp === 'number'
                        ? realtimeEvent.timestamp
                        : now(),
                    channel: realtimeEvent.channel,
                });
            } catch (error) {
                logger.warn('camera realtime handler error', {
                    requestId,
                    channel: CAMERA_REALTIME_CHANNEL,
                    error: safePreview(error),
                });
            }
        };

        const subscription = realtimeClient.subscribe<
            typeof CAMERA_REALTIME_CHANNEL,
            CameraRealtimeInboundPayload
        >(
            CAMERA_REALTIME_CHANNEL,
            handler,
            {
                eventTypes: [...CAMERA_REALTIME_EVENT_TYPES],
                autoResubscribeOnReconnect: true,
                durableKey: 'cameras',
            },
        );

        return () => {
            logger.debug('camera realtime unsubscribe', {
                requestId,
                channel: CAMERA_REALTIME_CHANNEL,
            });

            subscription.unsubscribe();
            unsubscribeMock();
        };
    }, [enabled, realtimeClient]);
}

function useCameraVideoRealtimeRawSubscription(
    enabled: boolean,
    onEvent?: (event: CameraVideoRealtimeEventPayload) => void,
): void {
    const realtimeClient = useRealtimeClient();
    const onEventRef = useRef(onEvent);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const requestId = `cameraVideoRealtimeSub:${now()}`;

        const unsubscribeMock = subscribeMockRealtimeEvent(
            (mockEvent) => {
                if (mockEvent.channel !== CAMERA_VIDEO_REALTIME_CHANNEL) {
                    return;
                }

                try {
                    const payload = isRecord(mockEvent.payload)
                        ? mockEvent.payload
                        : null;

                    const typeFromEvent = isCameraVideoRealtimeEventType(
                        mockEvent.type,
                    )
                        ? mockEvent.type as CameraVideoRealtimeEventType
                        : undefined;

                    const extracted = extractCameraVideoRealtimePayload(payload);
                    const type = typeFromEvent ?? extracted.type;

                    if (!type || !extracted.cameraId) {
                        return;
                    }

                    onEventRef.current?.({
                        type,
                        cameraId: extracted.cameraId,
                        sessionId: extracted.sessionId,
                        mode: extracted.mode,
                        profile: extracted.profile,
                        status: extracted.status,
                        bitrateKbps: extracted.bitrateKbps,
                        fps: extracted.fps,
                        overlay: extracted.overlay,
                        timestamp: mockEvent.timestamp,
                        channel: mockEvent.channel,
                    });
                } catch (error) {
                    logger.warn('camera video mock realtime handler error', {
                        requestId,
                        channel: mockEvent.channel,
                        error: safePreview(error),
                    });
                }
            },
        );

        if (!realtimeClient) {
            return () => {
                unsubscribeMock();
            };
        }

        logger.debug('camera video realtime subscribe', {
            requestId,
            channel: CAMERA_VIDEO_REALTIME_CHANNEL,
        });

        const handler = (
            realtimeEvent: RealtimeEvent<CameraVideoRealtimeInboundPayload>,
        ) => {
            try {
                const typeFromEvent = isCameraVideoRealtimeEventType(
                    realtimeEvent.type,
                )
                    ? realtimeEvent.type as CameraVideoRealtimeEventType
                    : undefined;

                const extracted = extractCameraVideoRealtimePayload(
                    realtimeEvent.payload,
                );

                const type = typeFromEvent ?? extracted.type;

                if (!type || !extracted.cameraId) {
                    return;
                }

                onEventRef.current?.({
                    type,
                    cameraId: extracted.cameraId,
                    sessionId: extracted.sessionId,
                    mode: extracted.mode,
                    profile: extracted.profile,
                    status: extracted.status,
                    bitrateKbps: extracted.bitrateKbps,
                    fps: extracted.fps,
                    overlay: extracted.overlay,
                    timestamp: typeof realtimeEvent.timestamp === 'number'
                        ? realtimeEvent.timestamp
                        : now(),
                    channel: realtimeEvent.channel,
                });
            } catch (error) {
                logger.warn('camera video realtime handler error', {
                    requestId,
                    channel: CAMERA_VIDEO_REALTIME_CHANNEL,
                    error: safePreview(error),
                });
            }
        };

        const subscription = realtimeClient.subscribe<
            typeof CAMERA_VIDEO_REALTIME_CHANNEL,
            CameraVideoRealtimeInboundPayload
        >(
            CAMERA_VIDEO_REALTIME_CHANNEL,
            handler,
            {
                eventTypes: [...CAMERA_VIDEO_REALTIME_EVENT_TYPES],
                autoResubscribeOnReconnect: true,
                durableKey: 'camera-video',
            },
        );

        return () => {
            logger.debug('camera video realtime unsubscribe', {
                requestId,
                channel: CAMERA_VIDEO_REALTIME_CHANNEL,
            });

            subscription.unsubscribe();
            unsubscribeMock();
        };
    }, [enabled, realtimeClient]);
}

export function useCameraRealtimeSubscription(
    filters?: Partial<CameraListQuery>,
    onEvent?: (event: CameraRealtimeEventPayload) => void,
): void {
    const filtersRef = useRef(filters);
    const onEventRef = useRef(onEvent);

    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useCameraRealtimeRawSubscription(
        Boolean(onEvent),
        (event) => {
            const currentFilters = filtersRef.current;

            if (!matchesCameraRealtimeFilters(event.camera, currentFilters)) {
                return;
            }

            onEventRef.current?.(event);
        },
    );
}

export function useCameraVideoRealtimeSubscription(
    filters?: CameraVideoRealtimeSubscriptionFilters,
    onEvent?: (event: CameraVideoRealtimeEventPayload) => void,
): void {
    const filtersRef = useRef(filters);
    const onEventRef = useRef(onEvent);

    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useCameraVideoRealtimeRawSubscription(
        Boolean(onEvent),
        (event) => {
            const currentFilters = filtersRef.current;

            if (!matchesCameraVideoRealtimeFilters(event, currentFilters)) {
                return;
            }

            onEventRef.current?.(event);
        },
    );
}

export function useCameraRealtimeQuerySync(
    query: CameraListQuery,
): CameraRealtimeQuerySyncResult {
    const queryClient = useQueryClient();

    const dtoQuery = useMemo(
        () => mapCameraListQueryToDto(query),
        [query],
    );

    const dtoQueryRef = useRef(dtoQuery);
    const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | undefined>();

    useEffect(() => {
        dtoQueryRef.current = dtoQuery;
    }, [dtoQuery]);

    useEffect(() => {
        return () => {
            if (invalidateTimerRef.current) {
                clearTimeout(invalidateTimerRef.current);
                invalidateTimerRef.current = null;
            }
        };
    }, []);

    const scheduleInvalidateList = (): void => {
        setLastUpdatedAt(new Date());

        if (invalidateTimerRef.current) {
            return;
        }

        invalidateTimerRef.current = setTimeout(() => {
            invalidateTimerRef.current = null;

            void queryClient.invalidateQueries({
                queryKey: cameraQueryKeys.list(dtoQueryRef.current),
            });
        }, 250);
    };

    useCameraRealtimeRawSubscription(
        true,
        (event) => {
            queryClient.setQueryData(
                cameraQueryKeys.details(event.camera.id),
                event.camera,
            );

            const currentDtoQuery = dtoQueryRef.current;
            const presentInCurrentList = patchCameraInListCache(
                queryClient,
                currentDtoQuery,
                event.camera,
            );

            const matchesCurrentFilters = matchesCameraRealtimeFilters(
                event.camera,
                { filters: query.filters },
            );

            const isOperationalChange =
                event.type === 'status_changed' ||
                event.type === 'camera.status_changed' ||
                event.type === 'camera.runtime_changed';

            if (isOperationalChange) {
                invalidateCameraVideoCaches(queryClient, event.camera.id);
            }

            if (isOperationalChange) {
                if (matchesCurrentFilters || presentInCurrentList) {
                    scheduleInvalidateList();
                }

                return;
            }

            if (presentInCurrentList && !matchesCurrentFilters) {
                scheduleInvalidateList();
                return;
            }

            if (!presentInCurrentList && matchesCurrentFilters) {
                scheduleInvalidateList();
            }
        },
    );

    return {
        query,
        lastUpdatedAt,
    };
}

export function useCameraLiveSession(
    options: UseCameraLiveSessionOptions,
): CameraLiveSessionView {
    const {
        cameraId = null,
        mode = 'original',
        profile,
        usage = 'details',
        enabled = true,
        keepAliveIntervalMs = 30_000,
    } = options;

    const capabilityQuery = useCameraVideoCapabilitiesQuery(
        (cameraId ?? '__camera_live_session_inactive__') as CameraId,
        {
            enabled: enabled && cameraId != null,
        },
    );

    const capabilities = capabilityQuery.data ?? null;

    const effectiveProfile = useMemo(
        () => pickDefaultProfile({
            capabilities,
            mode,
            usage,
            requestedProfile: profile,
        }),
        [capabilities, mode, profile, usage],
    );

    const capabilityStatus = resolveCapabilityStatus({
        enabled: enabled && cameraId != null,
        isLoading: capabilityQuery.isLoading || capabilityQuery.isFetching,
        isError: capabilityQuery.isError,
        hasData: Boolean(capabilities),
    });

    const createSessionMutation = useCameraCreateLiveSessionMutation();
    const keepAliveMutation = useCameraKeepAliveLiveSessionMutation();
    const deleteSessionMutation = useCameraDeleteLiveSessionMutation();

    const [session, setSession] = useState<CameraLiveSession | null>(null);
    const [sessionStatus, setSessionStatus] = useState<CameraSessionStatus>('idle');
    const [error, setError] = useState<CameraApiError | null>(null);
    const [reconnectToken, setReconnectToken] = useState(0);

    const mountedRef = useRef(true);
    const sessionRef = useRef<CameraLiveSession | null>(null);
    const desiredKeyRef = useRef<string | null>(null);
    const createGenerationRef = useRef(0);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
        };
    }, []);

    const applySession = useCallback(
        (next: CameraLiveSession | null): void => {
            sessionRef.current = next;
            setSession(next);

            if (!next) {
                setSessionStatus('idle');
                return;
            }

            if (next.status === 'ready') {
                setSessionStatus('ready');
                return;
            }

            if (next.status === 'expired' || isCameraLiveSessionExpired(next)) {
                setSessionStatus('expired');
                return;
            }

            if (next.status === 'failed') {
                setSessionStatus('failed');
                return;
            }

            setSessionStatus('creating');
        },
        [],
    );

    const close = useCallback(async (): Promise<void> => {
        const current = sessionRef.current;

        sessionRef.current = null;
        setSession(null);
        setSessionStatus('idle');

        if (!current || !cameraId) {
            return;
        }

        try {
            await deleteSessionMutation.mutateAsync({
                cameraId,
                sessionId: current.sessionId,
            });
        } catch (mutationError) {
            if (!mountedRef.current) {
                return;
            }

            setError(ensureCameraApiError(mutationError));
        }
    }, [cameraId, deleteSessionMutation]);

    const createSession = useCallback(async (): Promise<void> => {
        if (!enabled || !cameraId || !effectiveProfile) {
            return;
        }

        if (capabilityStatus !== 'ready' || !capabilities?.liveAvailable) {
            return;
        }

        const desiredKey = `${cameraId}|${mode}|${effectiveProfile}|${reconnectToken}`;

        if (
            desiredKeyRef.current === desiredKey &&
            sessionRef.current &&
            sessionRef.current.cameraId === cameraId &&
            sessionRef.current.mode === mode &&
            sessionRef.current.profile === effectiveProfile &&
            !isCameraLiveSessionExpired(sessionRef.current)
        ) {
            return;
        }

        desiredKeyRef.current = desiredKey;
        createGenerationRef.current += 1;
        const generation = createGenerationRef.current;

        setError(null);
        setSessionStatus('creating');

        const previousSession = sessionRef.current;

        if (previousSession && cameraId) {
            try {
                await deleteSessionMutation.mutateAsync({
                    cameraId,
                    sessionId: previousSession.sessionId,
                });
            } catch {
                // ignore stale cleanup failure
            }
        }

        sessionRef.current = null;
        setSession(null);

        try {
            const nextSession = await createSessionMutation.mutateAsync({
                cameraId,
                payload: {
                    mode,
                    profile: effectiveProfile,
                },
            });

            if (
                !mountedRef.current ||
                createGenerationRef.current !== generation
            ) {
                try {
                    await deleteSessionMutation.mutateAsync({
                        cameraId,
                        sessionId: nextSession.sessionId,
                    });
                } catch {
                    // ignore
                }

                return;
            }

            applySession(nextSession);
        } catch (mutationError) {
            if (!mountedRef.current) {
                return;
            }

            setError(ensureCameraApiError(mutationError));
            setSessionStatus('failed');
        }
    }, [
        enabled,
        cameraId,
        effectiveProfile,
        capabilityStatus,
        capabilities?.liveAvailable,
        reconnectToken,
        mode,
        deleteSessionMutation,
        createSessionMutation,
        applySession,
    ]);

    const refresh = useCallback(async (): Promise<void> => {
        setError(null);
        await capabilityQuery.refetch();

        const currentSession = sessionRef.current;

        if (!currentSession || !cameraId) {
            await createSession();
            return;
        }

        try {
            const nextSession = await keepAliveMutation.mutateAsync({
                cameraId,
                sessionId: currentSession.sessionId,
            });

            applySession(nextSession);
        } catch (mutationError) {
            const normalized = ensureCameraApiError(mutationError);
            setError(normalized);

            if (!isAbortLikeError(normalized)) {
                setSessionStatus('failed');
            }
        }
    }, [
        capabilityQuery,
        cameraId,
        createSession,
        keepAliveMutation,
        applySession,
    ]);

    const reconnect = useCallback(async (): Promise<void> => {
        await close();
        setReconnectToken((prev) => prev + 1);
    }, [close]);

    useEffect(() => {
        if (!enabled || !cameraId) {
            void close();
            return;
        }

        if (capabilityStatus === 'failed') {
            setError(capabilityQuery.error ?? null);
            return;
        }

        if (capabilityStatus === 'ready' && capabilities && !capabilities.liveAvailable) {
            setSessionStatus('failed');
            return;
        }

        if (
            capabilityStatus === 'ready' &&
            capabilities?.liveAvailable &&
            effectiveProfile
        ) {
            void createSession();
        }
    }, [
        enabled,
        cameraId,
        capabilityStatus,
        capabilities,
        effectiveProfile,
        createSession,
        close,
        capabilityQuery.error,
    ]);

    useEffect(() => {
        if (!enabled || !cameraId) {
            return;
        }

        const currentSession = sessionRef.current;

        if (!currentSession || sessionStatus !== 'ready') {
            return;
        }

        const intervalId = window.setInterval(() => {
            void refresh();
        }, Math.max(5_000, keepAliveIntervalMs));

        return () => {
            window.clearInterval(intervalId);
        };
    }, [
        enabled,
        cameraId,
        sessionStatus,
        keepAliveIntervalMs,
        refresh,
    ]);

    useEffect(() => {
        return () => {
            const current = sessionRef.current;

            if (!cameraId || !current) {
                return;
            }

            void deleteSessionMutation.mutateAsync({
                cameraId,
                sessionId: current.sessionId,
            }).catch(() => {
                // noop
            });
        };
    }, [cameraId, deleteSessionMutation]);

    useCameraVideoRealtimeSubscription(
        {
            cameraId: cameraId ?? undefined,
            sessionId: session?.sessionId,
            mode,
            profile: effectiveProfile ?? undefined,
        },
        cameraId
            ? (event) => {
                switch (event.type) {
                    case 'stream_updated':
                    case 'live_session.ready':
                    case 'stream.health_changed':
                    case 'stream.bitrate_changed':
                    case 'stream.fps_changed':
                        void refresh();
                        break;

                    case 'live_session.failed':
                        setSessionStatus('failed');
                        break;

                    case 'live_session.expired':
                        setSessionStatus('expired');

                        if (sessionRef.current) {
                            applySession({
                                ...sessionRef.current,
                                status: 'expired',
                            });
                        }
                        break;

                    case 'overlay.updated':
                    case 'live_session.created':
                    default:
                        break;
                }
            }
            : undefined,
    );

    const isLoading =
        capabilityStatus === 'loading' ||
        sessionStatus === 'creating';

    return useMemo<CameraLiveSessionView>(
        () => ({
            capabilities,
            capabilityStatus,
            effectiveProfile,
            session,
            sessionStatus,
            isLoading,
            error,
            refresh,
            reconnect,
            close,
        }),
        [
            capabilities,
            capabilityStatus,
            effectiveProfile,
            session,
            sessionStatus,
            isLoading,
            error,
            refresh,
            reconnect,
            close,
        ],
    );
}