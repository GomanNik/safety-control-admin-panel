// =====================
// File: src/entities/camera/types.ts
// Purpose:
//   Public contract for camera domain.
//   Camera domain now keeps:
//   - camera core dto
//   - source summary
//   - runtime state
//   - connection check flow
//   - legacy stream dto for backward compatibility
//   - video capabilities
//   - live sessions
//   - playback sessions
//   - overlay frames
// =====================

import type {
    CameraId,
    SiteId,
    IsoDateTimeString,
    Nullable,
    PaginationRequest,
    PaginationMeta,
    ApiErrorLike,
} from '../../shared/api';

export enum CameraStatus {
    Online = 'online',
    Offline = 'offline',
    Problem = 'problem',
    Initializing = 'initializing',
    Unknown = 'unknown',
}

export enum CameraStatusReasonCode {
    NoSignal = 'no_signal',
    StreamUnavailable = 'stream_unavailable',
    AuthFailed = 'auth_failed',
    HighLatency = 'high_latency',
    Initializing = 'initializing',
    NetworkUnreachable = 'network_unreachable',
    DnsFailed = 'dns_failed',
    Timeout = 'timeout',
    ConfigurationInvalid = 'configuration_invalid',
    DuplicateSource = 'duplicate_source',
    Unknown = 'unknown',
}

export type CameraSourceTransport = 'rtsp';

export interface CameraRtspSourceDto {
    transport: 'rtsp';
    host: string;
    port?: number;
    username: string;
    password: string;
    path: string;
    query?: Record<string, string>;
    use_tls?: boolean;
    connect_timeout_ms?: number;
    read_timeout_ms?: number;
}

export interface CameraSourceSummaryDto {
    transport: CameraSourceTransport;
    host: string;
    port: number;
    path: string;
    username_masked: string;
    credentials_set: boolean;
    use_tls?: boolean;
}

export type CameraProvisioningState =
    | 'pending_verification'
    | 'verified'
    | 'binding'
    | 'ready'
    | 'error'
    | 'disabled';

export type CameraConnectivityState =
    | 'reachable'
    | 'unreachable'
    | 'auth_failed'
    | 'timeout'
    | 'misconfigured'
    | 'unknown';

export type CameraStreamState =
    | 'streaming'
    | 'no_stream'
    | 'starting'
    | 'stopped'
    | 'error';

export interface CameraRuntimeStateDto {
    provisioning_state: CameraProvisioningState;
    connectivity_state: CameraConnectivityState;
    stream_state: CameraStreamState;
}

export interface CameraDiagnosticsDto {
    last_check_at?: Nullable<IsoDateTimeString>;
    last_success_at?: Nullable<IsoDateTimeString>;
    last_error_at?: Nullable<IsoDateTimeString>;
    last_error_code?: string;
    last_error_message?: string;
    response_time_ms?: number;
}

export type CameraConnectionCheckStatus =
    | 'ok'
    | 'auth_failed'
    | 'network_unreachable'
    | 'dns_failed'
    | 'timeout'
    | 'rtsp_invalid'
    | 'stream_not_found'
    | 'duplicate_source'
    | 'unsupported_transport'
    | 'site_not_found'
    | 'unknown_error';

export interface CameraConnectionCheckDiagnosticsDto {
    host_resolved?: boolean;
    tcp_connected?: boolean;
    auth_passed?: boolean;
    describe_passed?: boolean;
    response_time_ms?: number;
}

export interface CameraConnectionCheckDiscoveredDeviceDto {
    vendor?: string;
    model?: string;
    serial_number?: string;
    firmware_version?: string;
}

export interface CameraConnectionCheckDiscoveredStreamDto {
    codec?: string;
    width?: number;
    height?: number;
    fps?: number;
    has_video: boolean;
}

export interface CameraConnectionCheckErrorDto {
    code: CameraConnectionCheckStatus;
    message: string;
}

export interface CameraConnectionCheckRequestDto {
    site_id: SiteId;
    name: string;
    location: string;
    source: CameraRtspSourceDto;
}

export interface CameraConnectionCheckResponseDto {
    ok: boolean;
    status: CameraConnectionCheckStatus;
    check_token?: string;
    check_expires_at?: Nullable<IsoDateTimeString>;
    diagnostics?: CameraConnectionCheckDiagnosticsDto;
    discovered_device?: CameraConnectionCheckDiscoveredDeviceDto;
    discovered_stream?: CameraConnectionCheckDiscoveredStreamDto;
    source_preview?: CameraSourceSummaryDto;
    error?: CameraConnectionCheckErrorDto;
}

export interface CameraCreateDeviceOverridesDto {
    vendor?: string | null;
    model?: string | null;
    serial_number?: string | null;
}

export interface CameraCreateDto {
    site_id: SiteId;
    name: string;
    location: string;
    connection_check_token: string;
    device_overrides?: CameraCreateDeviceOverridesDto;
}

export interface CameraDto {
    id: CameraId;
    site_id: SiteId;
    name: string;
    location: string;
    vendor?: string;
    model?: string;
    serial_number?: string;
    status: CameraStatus;
    status_reason?: CameraStatusReasonCode;
    last_seen_at: Nullable<IsoDateTimeString>;
    source_summary?: CameraSourceSummaryDto;
    runtime_state?: CameraRuntimeStateDto;
    diagnostics?: CameraDiagnosticsDto;
    created_at?: IsoDateTimeString;
    updated_at?: IsoDateTimeString;
    site_name?: string;
}

export interface CameraListQueryDto extends PaginationRequest {
    site_id?: SiteId;
    status?: CameraStatus[];
    search?: string;
}

export interface CameraListResponseDto {
    items: CameraDto[];
    meta: PaginationMeta;
}

export interface CameraListFilters {
    siteId?: SiteId;
    statuses?: CameraStatus[];
    search?: string;
}

export interface CameraListQuery {
    filters: CameraListFilters;
    pagination: PaginationRequest;
}

export type CameraApiError = ApiErrorLike;

export const CAMERA_STATUS_VALUES = [
    CameraStatus.Online,
    CameraStatus.Offline,
    CameraStatus.Problem,
    CameraStatus.Initializing,
    CameraStatus.Unknown,
] as const;

// -----------------------------------------------------------------------------
// legacy stream dto — kept for backward compatibility during migration
// -----------------------------------------------------------------------------

export type CameraVideoMode =
    | 'original'
    | 'processed';

export interface CameraVideoStreamQuery {
    cameraId: CameraId;
    mode?: CameraVideoMode;
}

export interface CameraVideoStreamDto {
    camera_id: CameraId;
    mode: CameraVideoMode;
    stream_url?: string;
    is_available: boolean;
    processed_available: boolean;
}

export const CAMERA_VIDEO_MODE_VALUES = [
    'original',
    'processed',
] as const satisfies readonly CameraVideoMode[];

// -----------------------------------------------------------------------------
// richer video contract
// -----------------------------------------------------------------------------

export type CameraVideoProfile =
    | 'grid_preview'
    | 'single_hd'
    | 'processed_grid_preview'
    | 'processed_single_hd';

export const CAMERA_VIDEO_PROFILE_VALUES = [
    'grid_preview',
    'single_hd',
    'processed_grid_preview',
    'processed_single_hd',
] as const satisfies readonly CameraVideoProfile[];

export type CameraVideoTransport =
    | 'webrtc'
    | 'hls';

export interface CameraVideoCapabilitiesDto {
    camera_id: CameraId;
    live_available: boolean;
    archive_available: boolean;
    modes: CameraVideoMode[];
    profiles: CameraVideoProfile[];
    preferred_grid_profile: CameraVideoProfile;
    preferred_single_profile: CameraVideoProfile;
    audio_available: boolean;
    ptz_available: boolean;
}

export interface CreateCameraLiveSessionDto {
    mode: CameraVideoMode;
    profile: CameraVideoProfile;
}

export interface CameraLiveSessionIceServerDto {
    urls: string | string[];
    username?: string;
    credential?: string;
}

export interface CameraLiveSessionDto {
    session_id: string;
    camera_id: CameraId;
    mode: CameraVideoMode;
    profile: CameraVideoProfile;
    transport: 'webrtc';
    status:
        | 'creating'
        | 'ready'
        | 'failed'
        | 'expired';
    expires_at: IsoDateTimeString;
    webrtc?: {
        offer_sdp?: string;
        answer_sdp?: string;
        ice_servers?: CameraLiveSessionIceServerDto[];
    };
    media: {
        has_video: boolean;
        has_audio: boolean;
        codec?: string;
        width?: number;
        height?: number;
        fps?: number;
    };
    metrics?: {
        startup_delay_ms?: number;
        target_latency_ms?: number;
        bitrate_kbps?: number;
    };
    fallback_stream_url?: string;
    error?: {
        code: string;
        message: string;
    };
}

export interface CreateCameraPlaybackSessionDto {
    from: IsoDateTimeString;
    to: IsoDateTimeString;
}

export interface CameraPlaybackSessionDto {
    session_id: string;
    camera_id: CameraId;
    from: IsoDateTimeString;
    to: IsoDateTimeString;
    transport: 'hls';
    status:
        | 'creating'
        | 'ready'
        | 'failed'
        | 'expired';
    expires_at: IsoDateTimeString;
    manifest_url?: string;
    error?: {
        code: string;
        message: string;
    };
}

export interface CameraOverlayObjectDto {
    id: string;
    label: string;
    confidence?: number;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface CameraOverlayZoneDto {
    id: string;
    label: string;
    polygon: Array<{
        x: number;
        y: number;
    }>;
}

export interface CameraOverlayFrameDto {
    camera_id: CameraId;
    session_id: string;
    timestamp: number;
    objects: CameraOverlayObjectDto[];
    zones?: CameraOverlayZoneDto[];
}