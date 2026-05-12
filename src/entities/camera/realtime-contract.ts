// =====================
// File: src/entities/camera/realtime-contract.ts
// Purpose:
//   Realtime contract for camera domain.
//   Keeps backward compatibility with legacy short event names
//   and adds richer canonical camera/video events.
// =====================

import type {
    CameraDto,
    CameraOverlayFrameDto,
    CameraVideoMode,
    CameraVideoProfile,
} from './types';
import type { Camera } from './model';
import type { CameraId } from '../../shared/api';

export const CAMERA_REALTIME_CHANNEL = 'cameras' as const;

export const CAMERA_REALTIME_EVENT_TYPES = [
    'updated',
    'status_changed',
    'camera.updated',
    'camera.status_changed',
    'camera.runtime_changed',
] as const;

export type CameraRealtimeEventType =
    typeof CAMERA_REALTIME_EVENT_TYPES[number];

export type CameraRealtimeInboundPayload =
    | { camera: CameraDto }
    | {
    type: CameraRealtimeEventType;
    camera: CameraDto;
};

export interface CameraRealtimeEventPayload {
    type: CameraRealtimeEventType;
    camera: Camera;
    timestamp: number;
    channel?: string;
}

export const CAMERA_VIDEO_REALTIME_CHANNEL = 'camera-video' as const;

export const CAMERA_VIDEO_REALTIME_EVENT_TYPES = [
    'stream_updated',
    'live_session.created',
    'live_session.ready',
    'live_session.failed',
    'live_session.expired',
    'stream.health_changed',
    'stream.bitrate_changed',
    'stream.fps_changed',
    'overlay.updated',
] as const;

export type CameraVideoRealtimeEventType =
    typeof CAMERA_VIDEO_REALTIME_EVENT_TYPES[number];

export type CameraVideoRealtimeInboundPayload =
    | {
    camera_id: CameraId;
    session_id?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
    status?: string;
    bitrate_kbps?: number;
    fps?: number;
    overlay?: CameraOverlayFrameDto;
}
    | {
    type: CameraVideoRealtimeEventType;
    camera_id: CameraId;
    session_id?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
    status?: string;
    bitrate_kbps?: number;
    fps?: number;
    overlay?: CameraOverlayFrameDto;
}
    | {
    cameraId: CameraId;
    sessionId?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
    status?: string;
    bitrateKbps?: number;
    fps?: number;
    overlay?: CameraOverlayFrameDto;
}
    | {
    type: CameraVideoRealtimeEventType;
    cameraId: CameraId;
    sessionId?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
    status?: string;
    bitrateKbps?: number;
    fps?: number;
    overlay?: CameraOverlayFrameDto;
};

export interface CameraVideoRealtimeEventPayload {
    type: CameraVideoRealtimeEventType;
    cameraId: CameraId;
    sessionId?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
    status?: string;
    bitrateKbps?: number;
    fps?: number;
    overlay?: CameraOverlayFrameDto;
    timestamp: number;
    channel?: string;
}

const isRecord = (
    value: unknown,
): value is Record<string, unknown> =>
    typeof value === 'object' &&
    value !== null;

const isNumber = (
    value: unknown,
): value is number =>
    typeof value === 'number' &&
    Number.isFinite(value);

const isString = (
    value: unknown,
): value is string =>
    typeof value === 'string';

const isCameraVideoMode = (
    value: unknown,
): value is CameraVideoMode =>
    value === 'original' || value === 'processed';

const isCameraVideoProfile = (
    value: unknown,
): value is CameraVideoProfile =>
    value === 'grid_preview' ||
    value === 'single_hd' ||
    value === 'processed_grid_preview' ||
    value === 'processed_single_hd';

const isOverlayBboxLike = (
    value: unknown,
): value is CameraOverlayFrameDto['objects'][number]['bbox'] => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        isNumber(value.x) &&
        isNumber(value.y) &&
        isNumber(value.width) &&
        isNumber(value.height)
    );
};

const isOverlayObjectLike = (
    value: unknown,
): value is CameraOverlayFrameDto['objects'][number] => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        isString(value.id) &&
        isString(value.label) &&
        (value.confidence === undefined || isNumber(value.confidence)) &&
        isOverlayBboxLike(value.bbox)
    );
};

const isOverlayPolygonPointLike = (
    value: unknown,
): value is NonNullable<CameraOverlayFrameDto['zones']>[number]['polygon'][number] => {
    if (!isRecord(value)) {
        return false;
    }

    return isNumber(value.x) && isNumber(value.y);
};

const isOverlayZoneLike = (
    value: unknown,
): value is NonNullable<CameraOverlayFrameDto['zones']>[number] => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        isString(value.id) &&
        isString(value.label) &&
        Array.isArray(value.polygon) &&
        value.polygon.every(isOverlayPolygonPointLike)
    );
};

const isCameraOverlayFrameDtoLike = (
    value: unknown,
): value is CameraOverlayFrameDto => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        isString(value.camera_id) &&
        isString(value.session_id) &&
        isNumber(value.timestamp) &&
        Array.isArray(value.objects) &&
        value.objects.every(isOverlayObjectLike) &&
        (
            value.zones === undefined ||
            (
                Array.isArray(value.zones) &&
                value.zones.every(isOverlayZoneLike)
            )
        )
    );
};

export function isCameraRealtimeEventType(
    value: unknown,
): value is CameraRealtimeEventType {
    return (
        typeof value === 'string' &&
        (CAMERA_REALTIME_EVENT_TYPES as readonly string[]).includes(value)
    );
}

export function isCameraVideoRealtimeEventType(
    value: unknown,
): value is CameraVideoRealtimeEventType {
    return (
        typeof value === 'string' &&
        (CAMERA_VIDEO_REALTIME_EVENT_TYPES as readonly string[]).includes(value)
    );
}

export function isCameraDtoLike(
    value: unknown,
): value is CameraDto {
    if (!isRecord(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;

    return (
        typeof record.id === 'string' &&
        typeof record.site_id === 'string' &&
        typeof record.name === 'string' &&
        typeof record.location === 'string' &&
        typeof record.status === 'string' &&
        (
            record.last_seen_at == null ||
            typeof record.last_seen_at === 'string'
        )
    );
}

export function extractCameraDtoFromRealtimePayload(
    payload: unknown,
): {
    type?: CameraRealtimeEventType;
    camera?: CameraDto;
} {
    if (!isRecord(payload)) {
        return {};
    }

    const type = isCameraRealtimeEventType(payload.type)
        ? payload.type
        : undefined;

    const camera = isCameraDtoLike(payload.camera)
        ? payload.camera
        : undefined;

    return {
        type,
        camera,
    };
}

export function extractCameraVideoRealtimePayload(
    payload: unknown,
): {
    type?: CameraVideoRealtimeEventType;
    cameraId?: CameraId;
    sessionId?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;
    status?: string;
    bitrateKbps?: number;
    fps?: number;
    overlay?: CameraOverlayFrameDto;
} {
    if (!isRecord(payload)) {
        return {};
    }

    const type = isCameraVideoRealtimeEventType(payload.type)
        ? payload.type
        : undefined;

    const cameraId = typeof payload.camera_id === 'string'
        ? payload.camera_id
        : typeof payload.cameraId === 'string'
            ? payload.cameraId
            : undefined;

    const sessionId = typeof payload.session_id === 'string'
        ? payload.session_id
        : typeof payload.sessionId === 'string'
            ? payload.sessionId
            : undefined;

    const mode = isCameraVideoMode(payload.mode)
        ? payload.mode
        : undefined;

    const profile = isCameraVideoProfile(payload.profile)
        ? payload.profile
        : undefined;

    const bitrateKbps = typeof payload.bitrate_kbps === 'number'
        ? payload.bitrate_kbps
        : typeof payload.bitrateKbps === 'number'
            ? payload.bitrateKbps
            : undefined;

    const fps = typeof payload.fps === 'number'
        ? payload.fps
        : undefined;

    const overlay = isCameraOverlayFrameDtoLike(payload.overlay)
        ? payload.overlay
        : undefined;

    return {
        type,
        cameraId: cameraId as CameraId | undefined,
        sessionId,
        mode,
        profile,
        status:
            typeof payload.status === 'string'
                ? payload.status
                : undefined,
        bitrateKbps,
        fps,
        overlay,
    };
}