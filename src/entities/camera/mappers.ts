// =====================
// File: src/entities/camera/mappers.ts
// Purpose:
//   Camera mappers.
//   Maps:
//   - core camera dto -> model
//   - connection check response dto -> model
//   - list query -> dto
//   - legacy video stream dto -> model
//   - video capabilities dto -> model
//   - live session dto -> model
//   - playback session dto -> model
//   - overlay frame dto -> model
// =====================

import { parseIsoDateOrInvalid } from '../../shared/date/parse';
import { getGlobalLogger } from '../../shared/logging';

import type {
    CameraConnectionCheckResponseDto,
    CameraDto,
    CameraListFilters,
    CameraListQuery,
    CameraListQueryDto,
    CameraPlaybackSessionDto,
    CameraLiveSessionDto,
    CameraVideoCapabilitiesDto,
    CameraVideoStreamDto,
    CameraVideoStreamQuery,
} from './types';

import type {
    Camera,
    CameraConnectionCheckResult,
    CameraDiagnostics,
    CameraLiveSession,
    CameraPlaybackSession,
    CameraRuntimeState,
    CameraSourceSummary,
    CameraVideoCapabilities,
    CameraVideoStream,
} from './model';

const logger = getGlobalLogger()
    .child('entities')
    .child('camera')
    .child('mappers');

const isInvalidDate = (date: Date): boolean =>
    Number.isNaN(date.getTime());

const safePreview = (
    value: unknown,
    maxLen: number = 64,
): string => {
    const text = String(value ?? '');

    if (text.length <= maxLen) {
        return text;
    }

    return `${text.slice(0, maxLen)}…`;
};

const parseNullableIsoDate = (
    value: unknown,
): Date | null => {
    if (!value) {
        return null;
    }

    const parsed = parseIsoDateOrInvalid(String(value));

    if (isInvalidDate(parsed)) {
        return null;
    }

    return parsed;
};

function mapCameraSourceSummaryDtoToModel(
    dto: CameraDto['source_summary'] | CameraConnectionCheckResponseDto['source_preview'],
): CameraSourceSummary | undefined {
    if (!dto) {
        return undefined;
    }

    return {
        transport: dto.transport,
        host: dto.host,
        port: dto.port,
        path: dto.path,
        usernameMasked: dto.username_masked,
        credentialsSet: dto.credentials_set,
        useTls: dto.use_tls,
    };
}

function mapCameraRuntimeStateDtoToModel(
    dto: CameraDto['runtime_state'],
): CameraRuntimeState | undefined {
    if (!dto) {
        return undefined;
    }

    return {
        provisioningState: dto.provisioning_state,
        connectivityState: dto.connectivity_state,
        streamState: dto.stream_state,
    };
}

function mapCameraDiagnosticsDtoToModel(
    dto: CameraDto['diagnostics'],
): CameraDiagnostics | undefined {
    if (!dto) {
        return undefined;
    }

    return {
        lastCheckAt: parseNullableIsoDate(dto.last_check_at),
        lastSuccessAt: parseNullableIsoDate(dto.last_success_at),
        lastErrorAt: parseNullableIsoDate(dto.last_error_at),
        lastErrorCode: dto.last_error_code ?? undefined,
        lastErrorMessage: dto.last_error_message ?? undefined,
        responseTimeMs: dto.response_time_ms,
    };
}

export function mapCameraDtoToModel(dto: CameraDto): Camera {
    const lastSeenAt = dto.last_seen_at
        ? parseIsoDateOrInvalid(dto.last_seen_at)
        : null;

    if (dto.last_seen_at && lastSeenAt && isInvalidDate(lastSeenAt)) {
        logger.warn('camera mapper: invalid last_seen_at', {
            cameraId: safePreview(dto.id),
            value: safePreview(dto.last_seen_at),
        });
    }

    return {
        id: dto.id,
        siteId: dto.site_id,
        siteName: dto.site_name ?? undefined,
        name: dto.name,
        location: dto.location,
        vendor: dto.vendor ?? undefined,
        model: dto.model ?? undefined,
        serialNumber: dto.serial_number ?? undefined,
        status: dto.status,
        statusReason: dto.status_reason ?? undefined,
        lastSeenAt,
        sourceSummary: mapCameraSourceSummaryDtoToModel(dto.source_summary),
        runtimeState: mapCameraRuntimeStateDtoToModel(dto.runtime_state),
        diagnostics: mapCameraDiagnosticsDtoToModel(dto.diagnostics),
    };
}

function mapCameraFiltersToDto(
    filters: CameraListFilters,
): Partial<CameraListQueryDto> {
    const result: Partial<CameraListQueryDto> = {};

    if (filters.siteId) {
        result.site_id = filters.siteId;
    }

    if (filters.statuses && filters.statuses.length > 0) {
        result.status = filters.statuses;
    }

    if (filters.search) {
        result.search = filters.search;
    }

    return result;
}

export function mapCameraListQueryToDto(
    query: CameraListQuery,
): CameraListQueryDto {
    const filterDto = mapCameraFiltersToDto(query.filters);

    return {
        page: query.pagination.page,
        pageSize: query.pagination.pageSize,
        ...filterDto,
    };
}

export function mapCameraVideoStreamDtoToModel(
    dto: CameraVideoStreamDto,
): CameraVideoStream {
    return {
        cameraId: dto.camera_id,
        mode: dto.mode,
        streamUrl: dto.stream_url ?? undefined,
        isAvailable: dto.is_available,
        processedAvailable: dto.processed_available,
    };
}

export function mapCameraVideoStreamQueryToDto(
    query: CameraVideoStreamQuery,
): Record<string, string> {
    const output: Record<string, string> = {};

    if (query.mode) {
        output.mode = query.mode;
    }

    return output;
}

export function mapCameraVideoCapabilitiesDtoToModel(
    dto: CameraVideoCapabilitiesDto,
): CameraVideoCapabilities {
    return {
        cameraId: dto.camera_id,
        liveAvailable: dto.live_available,
        archiveAvailable: dto.archive_available,
        modes: [...dto.modes],
        profiles: [...dto.profiles],
        preferredGridProfile: dto.preferred_grid_profile,
        preferredSingleProfile: dto.preferred_single_profile,
        audioAvailable: dto.audio_available,
        ptzAvailable: dto.ptz_available,
    };
}

export function mapCameraLiveSessionDtoToModel(
    dto: CameraLiveSessionDto,
): CameraLiveSession {
    return {
        sessionId: dto.session_id,
        cameraId: dto.camera_id,
        mode: dto.mode,
        profile: dto.profile,
        transport: dto.transport,
        status: dto.status,
        expiresAt: parseNullableIsoDate(dto.expires_at),
        webrtc: dto.webrtc
            ? {
                offerSdp: dto.webrtc.offer_sdp ?? undefined,
                answerSdp: dto.webrtc.answer_sdp ?? undefined,
                iceServers: dto.webrtc.ice_servers?.map((item) => ({
                    urls: item.urls,
                    username: item.username,
                    credential: item.credential,
                })),
            }
            : undefined,
        media: {
            hasVideo: dto.media.has_video,
            hasAudio: dto.media.has_audio,
            codec: dto.media.codec ?? undefined,
            width: dto.media.width,
            height: dto.media.height,
            fps: dto.media.fps,
        },
        metrics: dto.metrics
            ? {
                startupDelayMs: dto.metrics.startup_delay_ms,
                targetLatencyMs: dto.metrics.target_latency_ms,
                bitrateKbps: dto.metrics.bitrate_kbps,
            }
            : undefined,
        fallbackStreamUrl: dto.fallback_stream_url ?? undefined,
        error: dto.error
            ? {
                code: dto.error.code,
                message: dto.error.message,
            }
            : undefined,
    };
}

export function mapCameraPlaybackSessionDtoToModel(
    dto: CameraPlaybackSessionDto,
): CameraPlaybackSession {
    return {
        sessionId: dto.session_id,
        cameraId: dto.camera_id,
        from: parseNullableIsoDate(dto.from),
        to: parseNullableIsoDate(dto.to),
        transport: dto.transport,
        status: dto.status,
        expiresAt: parseNullableIsoDate(dto.expires_at),
        manifestUrl: dto.manifest_url ?? undefined,
        error: dto.error
            ? {
                code: dto.error.code,
                message: dto.error.message,
            }
            : undefined,
    };
}

export function mapCameraConnectionCheckResponseToModel(
    dto: CameraConnectionCheckResponseDto,
): CameraConnectionCheckResult {
    return {
        ok: dto.ok,
        status: dto.status,
        checkToken: dto.check_token ?? undefined,
        checkExpiresAt: parseNullableIsoDate(dto.check_expires_at),
        diagnostics: dto.diagnostics
            ? {
                hostResolved: dto.diagnostics.host_resolved,
                tcpConnected: dto.diagnostics.tcp_connected,
                authPassed: dto.diagnostics.auth_passed,
                describePassed: dto.diagnostics.describe_passed,
                responseTimeMs: dto.diagnostics.response_time_ms,
            }
            : undefined,
        discoveredDevice: dto.discovered_device
            ? {
                vendor: dto.discovered_device.vendor ?? undefined,
                model: dto.discovered_device.model ?? undefined,
                serialNumber: dto.discovered_device.serial_number ?? undefined,
                firmwareVersion: dto.discovered_device.firmware_version ?? undefined,
            }
            : undefined,
        discoveredStream: dto.discovered_stream
            ? {
                codec: dto.discovered_stream.codec ?? undefined,
                width: dto.discovered_stream.width,
                height: dto.discovered_stream.height,
                fps: dto.discovered_stream.fps,
                hasVideo: dto.discovered_stream.has_video,
            }
            : undefined,
        sourcePreview: mapCameraSourceSummaryDtoToModel(dto.source_preview),
        error: dto.error
            ? {
                code: dto.error.code,
                message: dto.error.message,
            }
            : undefined,
    };
}