// =====================
// File: src/entities/camera/api.ts
// Purpose:
//   Camera API client.
//   Keeps camera as a single domain and extends it with richer video contract:
//   - camera list / details
//   - legacy stream endpoint
//   - connection check / create / delete
//   - video capabilities
//   - live sessions
//   - playback sessions
// =====================

import type {
    CameraConnectionCheckRequestDto,
    CameraConnectionCheckResponseDto,
    CameraCreateDto,
    CameraDto,
    CameraListQueryDto,
    CameraListResponseDto,
    CameraOverlayFrameDto,
    CameraPlaybackSessionDto,
    CameraVideoCapabilitiesDto,
    CameraVideoStreamDto,
    CameraVideoStreamQuery,
    CreateCameraLiveSessionDto,
    CreateCameraPlaybackSessionDto,
    CameraLiveSessionDto,
} from './types';

import { mapCameraVideoStreamQueryToDto } from './mappers';

import {
    type CameraId,
    type HttpClient,
    type HttpClientRequestOptions,
    createRestResourceClient,
    isAbortLikeError,
} from '../../shared/api';
import { getGlobalLogger } from '../../shared/logging';

const logger = getGlobalLogger()
    .child('entities')
    .child('camera')
    .child('api');

export type CameraApiRequestOptions = HttpClientRequestOptions;

export type CameraVideoStreamQueryDto = Record<string, string>;

export interface CameraApiClient {
    getCameraById(
        id: CameraId,
        options?: CameraApiRequestOptions,
    ): Promise<CameraDto>;

    getCameraList(
        query: CameraListQueryDto,
        options?: CameraApiRequestOptions,
    ): Promise<CameraListResponseDto>;

    getCameraVideoStream(
        query: CameraVideoStreamQuery,
        options?: CameraApiRequestOptions,
    ): Promise<CameraVideoStreamDto>;

    getCameraVideoCapabilities(
        cameraId: CameraId,
        options?: CameraApiRequestOptions,
    ): Promise<CameraVideoCapabilitiesDto>;

    createCameraLiveSession(
        cameraId: CameraId,
        payload: CreateCameraLiveSessionDto,
        options?: CameraApiRequestOptions,
    ): Promise<CameraLiveSessionDto>;

    keepAliveCameraLiveSession(
        cameraId: CameraId,
        sessionId: string,
        options?: CameraApiRequestOptions,
    ): Promise<CameraLiveSessionDto>;

    deleteCameraLiveSession(
        cameraId: CameraId,
        sessionId: string,
        options?: CameraApiRequestOptions,
    ): Promise<void>;

    createCameraPlaybackSession(
        cameraId: CameraId,
        payload: CreateCameraPlaybackSessionDto,
        options?: CameraApiRequestOptions,
    ): Promise<CameraPlaybackSessionDto>;

    deleteCameraPlaybackSession(
        cameraId: CameraId,
        sessionId: string,
        options?: CameraApiRequestOptions,
    ): Promise<void>;

    getCameraOverlayFrame(
        cameraId: CameraId,
        sessionId: string,
        options?: CameraApiRequestOptions,
    ): Promise<CameraOverlayFrameDto>;

    checkCameraConnection(
        payload: CameraConnectionCheckRequestDto,
        options?: CameraApiRequestOptions,
    ): Promise<CameraConnectionCheckResponseDto>;

    createCamera(
        payload: CameraCreateDto,
        options?: CameraApiRequestOptions,
    ): Promise<CameraDto>;

    deleteCamera(
        id: CameraId,
        options?: CameraApiRequestOptions,
    ): Promise<void>;
}

const CAMERA_API_BASE_PATH = '/cameras';

const now = (): number => Date.now();

const getApiStatus = (error: unknown): number | undefined => {
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
    maxLength: number = 64,
): string => {
    const normalized = String(value ?? '');

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength)}…`;
};

const normalizeBasePath = (
    basePath: string,
): string => {
    const trimmed = basePath.trim();

    if (!trimmed) {
        return CAMERA_API_BASE_PATH;
    }

    const withoutTrailingSlash = trimmed.replace(/\/+$/, '');

    return withoutTrailingSlash || CAMERA_API_BASE_PATH;
};

const getListQueryMeta = (
    query: CameraListQueryDto,
): Record<string, unknown> => ({
    page: query.page,
    pageSize: query.pageSize,
    hasSiteId: Boolean(query.site_id),
    statusesCount: query.status?.length ?? 0,
    hasSearch: Boolean(
        query.search &&
        String(query.search).trim().length > 0,
    ),
});

const getVideoStreamQueryMeta = (
    query: CameraVideoStreamQuery,
): Record<string, unknown> => ({
    cameraId: safePreview(query.cameraId),
    mode: query.mode ?? 'original',
});

const getVideoCapabilitiesMeta = (
    cameraId: CameraId,
): Record<string, unknown> => ({
    cameraId: safePreview(cameraId),
});

const getConnectionCheckMeta = (
    payload: CameraConnectionCheckRequestDto,
): Record<string, unknown> => ({
    siteId: safePreview(payload.site_id),
    name: safePreview(payload.name),
    location: safePreview(payload.location),
    transport: payload.source.transport,
    host: safePreview(payload.source.host),
    port: payload.source.port ?? 554,
    path: safePreview(payload.source.path),
    hasUsername: Boolean(String(payload.source.username ?? '').trim()),
    hasPassword: Boolean(String(payload.source.password ?? '').trim()),
});

const getCreateCameraMeta = (
    payload: CameraCreateDto,
): Record<string, unknown> => ({
    siteId: safePreview(payload.site_id),
    name: safePreview(payload.name),
    location: safePreview(payload.location),
    hasConnectionCheckToken: Boolean(
        String(payload.connection_check_token ?? '').trim(),
    ),
    deviceOverrideKeys: Object.keys(payload.device_overrides ?? {}),
});

const getLiveSessionMeta = (args: {
    cameraId: CameraId;
    mode: CreateCameraLiveSessionDto['mode'];
    profile: CreateCameraLiveSessionDto['profile'];
}): Record<string, unknown> => ({
    cameraId: safePreview(args.cameraId),
    mode: args.mode,
    profile: args.profile,
});

const getPlaybackSessionMeta = (args: {
    cameraId: CameraId;
    from: string;
    to: string;
}): Record<string, unknown> => ({
    cameraId: safePreview(args.cameraId),
    from: args.from,
    to: args.to,
});

const logRequestFailure = (
    operation: string,
    requestId: string,
    startedAt: number,
    error: unknown,
    meta?: Record<string, unknown>,
): void => {
    if (isAbortLikeError(error)) {
        logger.debug('camera api aborted', {
            op: operation,
            requestId,
            durationMs: now() - startedAt,
            ...(meta ?? {}),
        });
        return;
    }

    logger.warn('camera api failed', {
        op: operation,
        requestId,
        durationMs: now() - startedAt,
        apiStatus: getApiStatus(error),
        ...(meta ?? {}),
    });
};

const toRequestOptions = (
    options?: CameraApiRequestOptions,
): {
    signal?: AbortSignal;
    timeoutMs?: number;
    headers?: Record<string, string>;
} => ({
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
    headers: options?.headers,
});

export function createCameraApiClient(
    httpClient: HttpClient,
    basePath: string = CAMERA_API_BASE_PATH,
): CameraApiClient {
    const rootPath = normalizeBasePath(basePath);

    return createRestResourceClient<CameraApiClient>(
        {
            httpClient,
            basePath: rootPath,
        },
        ({ httpClient, basePath }) => {
            const buildUrl = (suffix: string = ''): string =>
                suffix ? `${basePath}${suffix}` : basePath;

            return {
                async getCameraById(id, options) {
                    const requestId = `getCameraById:${now()}:${safePreview(id)}`;
                    const startedAt = now();

                    try {
                        const response = await httpClient.get<CameraDto>(
                            buildUrl(`/${id}`),
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'getCameraById',
                            requestId,
                            startedAt,
                            error,
                            { id: safePreview(id) },
                        );
                        throw error;
                    }
                },

                async getCameraList(query, options) {
                    const requestId = `getCameraList:${now()}`;
                    const startedAt = now();
                    const meta = getListQueryMeta(query);

                    try {
                        const response = await httpClient.get<
                            CameraListResponseDto,
                            CameraListQueryDto
                        >(
                            buildUrl(),
                            {
                                ...toRequestOptions(options),
                                query,
                            },
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'getCameraList',
                            requestId,
                            startedAt,
                            error,
                            meta,
                        );
                        throw error;
                    }
                },

                async getCameraVideoStream(query, options) {
                    const requestId = `getCameraVideoStream:${now()}:${safePreview(query.cameraId)}`;
                    const startedAt = now();
                    const meta = getVideoStreamQueryMeta(query);

                    try {
                        const response = await httpClient.get<
                            CameraVideoStreamDto,
                            CameraVideoStreamQueryDto
                        >(
                            buildUrl(`/${query.cameraId}/video/stream`),
                            {
                                ...toRequestOptions(options),
                                query: mapCameraVideoStreamQueryToDto(query),
                            },
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'getCameraVideoStream',
                            requestId,
                            startedAt,
                            error,
                            meta,
                        );
                        throw error;
                    }
                },

                async getCameraVideoCapabilities(cameraId, options) {
                    const requestId = `getCameraVideoCapabilities:${now()}:${safePreview(cameraId)}`;
                    const startedAt = now();
                    const meta = getVideoCapabilitiesMeta(cameraId);

                    try {
                        const response = await httpClient.get<CameraVideoCapabilitiesDto>(
                            buildUrl(`/${cameraId}/video/capabilities`),
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'getCameraVideoCapabilities',
                            requestId,
                            startedAt,
                            error,
                            meta,
                        );
                        throw error;
                    }
                },

                async createCameraLiveSession(cameraId, payload, options) {
                    const requestId = `createCameraLiveSession:${now()}:${safePreview(cameraId)}`;
                    const startedAt = now();
                    const meta = getLiveSessionMeta({
                        cameraId,
                        mode: payload.mode,
                        profile: payload.profile,
                    });

                    try {
                        const response = await httpClient.post<
                            CameraLiveSessionDto,
                            CreateCameraLiveSessionDto
                        >(
                            buildUrl(`/${cameraId}/live-sessions`),
                            payload,
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'createCameraLiveSession',
                            requestId,
                            startedAt,
                            error,
                            meta,
                        );
                        throw error;
                    }
                },

                async keepAliveCameraLiveSession(cameraId, sessionId, options) {
                    const requestId = `keepAliveCameraLiveSession:${now()}:${safePreview(cameraId)}:${safePreview(sessionId)}`;
                    const startedAt = now();

                    try {
                        const response = await httpClient.post<CameraLiveSessionDto>(
                            buildUrl(`/${cameraId}/live-sessions/${sessionId}/keepalive`),
                            undefined,
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'keepAliveCameraLiveSession',
                            requestId,
                            startedAt,
                            error,
                            {
                                cameraId: safePreview(cameraId),
                                sessionId: safePreview(sessionId),
                            },
                        );
                        throw error;
                    }
                },

                async deleteCameraLiveSession(cameraId, sessionId, options) {
                    const requestId = `deleteCameraLiveSession:${now()}:${safePreview(cameraId)}:${safePreview(sessionId)}`;
                    const startedAt = now();

                    try {
                        await httpClient.delete<void>(
                            buildUrl(`/${cameraId}/live-sessions/${sessionId}`),
                            toRequestOptions(options),
                        );
                    } catch (error) {
                        logRequestFailure(
                            'deleteCameraLiveSession',
                            requestId,
                            startedAt,
                            error,
                            {
                                cameraId: safePreview(cameraId),
                                sessionId: safePreview(sessionId),
                            },
                        );
                        throw error;
                    }
                },

                async createCameraPlaybackSession(cameraId, payload, options) {
                    const requestId = `createCameraPlaybackSession:${now()}:${safePreview(cameraId)}`;
                    const startedAt = now();
                    const meta = getPlaybackSessionMeta({
                        cameraId,
                        from: payload.from,
                        to: payload.to,
                    });

                    try {
                        const response = await httpClient.post<
                            CameraPlaybackSessionDto,
                            CreateCameraPlaybackSessionDto
                        >(
                            buildUrl(`/${cameraId}/playback-sessions`),
                            payload,
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'createCameraPlaybackSession',
                            requestId,
                            startedAt,
                            error,
                            meta,
                        );
                        throw error;
                    }
                },

                async deleteCameraPlaybackSession(cameraId, sessionId, options) {
                    const requestId = `deleteCameraPlaybackSession:${now()}:${safePreview(cameraId)}:${safePreview(sessionId)}`;
                    const startedAt = now();

                    try {
                        await httpClient.delete<void>(
                            buildUrl(`/${cameraId}/playback-sessions/${sessionId}`),
                            toRequestOptions(options),
                        );
                    } catch (error) {
                        logRequestFailure(
                            'deleteCameraPlaybackSession',
                            requestId,
                            startedAt,
                            error,
                            {
                                cameraId: safePreview(cameraId),
                                sessionId: safePreview(sessionId),
                            },
                        );
                        throw error;
                    }
                },

                async getCameraOverlayFrame(cameraId, sessionId, options) {
                    const requestId = `getCameraOverlayFrame:${now()}:${safePreview(cameraId)}:${safePreview(sessionId)}`;
                    const startedAt = now();

                    try {
                        const response = await httpClient.get<CameraOverlayFrameDto>(
                            buildUrl(`/${cameraId}/live-sessions/${sessionId}/overlay`),
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'getCameraOverlayFrame',
                            requestId,
                            startedAt,
                            error,
                            {
                                cameraId: safePreview(cameraId),
                                sessionId: safePreview(sessionId),
                            },
                        );
                        throw error;
                    }
                },

                async checkCameraConnection(payload, options) {
                    const requestId = `checkCameraConnection:${now()}:${safePreview(payload.source.host)}`;
                    const startedAt = now();
                    const meta = getConnectionCheckMeta(payload);

                    try {
                        const response = await httpClient.post<
                            CameraConnectionCheckResponseDto,
                            CameraConnectionCheckRequestDto
                        >(
                            buildUrl('/connection-checks'),
                            payload,
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'checkCameraConnection',
                            requestId,
                            startedAt,
                            error,
                            meta,
                        );
                        throw error;
                    }
                },

                async createCamera(payload, options) {
                    const requestId = `createCamera:${now()}:${safePreview(payload.site_id)}:${safePreview(payload.name)}`;
                    const startedAt = now();
                    const meta = getCreateCameraMeta(payload);

                    try {
                        const response = await httpClient.post<
                            CameraDto,
                            CameraCreateDto
                        >(
                            buildUrl(),
                            payload,
                            toRequestOptions(options),
                        );

                        return response.data;
                    } catch (error) {
                        logRequestFailure(
                            'createCamera',
                            requestId,
                            startedAt,
                            error,
                            meta,
                        );
                        throw error;
                    }
                },

                async deleteCamera(id, options) {
                    const requestId = `deleteCamera:${now()}:${safePreview(id)}`;
                    const startedAt = now();

                    try {
                        await httpClient.delete<void>(
                            buildUrl(`/${id}`),
                            toRequestOptions(options),
                        );
                    } catch (error) {
                        logRequestFailure(
                            'deleteCamera',
                            requestId,
                            startedAt,
                            error,
                            { id: safePreview(id) },
                        );
                        throw error;
                    }
                },
            };
        },
    );
}