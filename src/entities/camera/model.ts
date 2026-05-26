// =====================
// File: src/entities/camera/model.ts
// Purpose:
//   Domain model for camera module.
//   Keeps camera as a single entity domain and extends it with:
//   - runtime/source summaries
//   - video capabilities
//   - live sessions
//   - playback sessions
//   - overlay frames
//   - player state
// =====================

import type {
    CameraId,
    SiteId,
} from '../../shared/api';

import {
    CameraStatus,
    CameraStatusReasonCode,
    type CameraConnectionCheckStatus,
    type CameraConnectivityState,
    type CameraProvisioningState,
    type CameraSourceTransport,
    type CameraStreamState,
    type CameraVideoMode,
    type CameraVideoProfile,
} from './types';

export interface CameraSourceSummary {
    transport: CameraSourceTransport;
    host: string;
    port: number;
    path: string;
    usernameMasked: string;
    credentialsSet: boolean;
    useTls?: boolean;
}

export interface CameraRuntimeState {
    provisioningState: CameraProvisioningState;
    connectivityState: CameraConnectivityState;
    streamState: CameraStreamState;
}

export interface CameraDiagnostics {
    lastCheckAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    responseTimeMs?: number;
}

export interface Camera {
    id: CameraId;
    siteId: SiteId;
    siteName?: string;
    name: string;
    location: string;
    vendor?: string;
    model?: string;
    serialNumber?: string;
    status: CameraStatus;
    statusReason?: CameraStatusReasonCode;
    lastSeenAt: Date | null;
    sourceSummary?: CameraSourceSummary;
    runtimeState?: CameraRuntimeState;
    diagnostics?: CameraDiagnostics;
}

export interface CameraVideoStream {
    cameraId: CameraId;
    mode: CameraVideoMode;
    streamUrl?: string;
    isAvailable: boolean;
    processedAvailable: boolean;
}

export interface CameraVideoCapabilities {
    cameraId: CameraId;
    liveAvailable: boolean;
    archiveAvailable: boolean;
    modes: CameraVideoMode[];
    profiles: CameraVideoProfile[];
    preferredGridProfile: CameraVideoProfile;
    preferredSingleProfile: CameraVideoProfile;
    audioAvailable: boolean;
    ptzAvailable: boolean;
}

export interface CameraLiveSession {
    sessionId: string;
    cameraId: CameraId;
    mode: CameraVideoMode;
    profile: CameraVideoProfile;
    transport: 'webrtc';
    status:
        | 'creating'
        | 'ready'
        | 'failed'
        | 'expired';
    expiresAt: Date | null;
    webrtc?: {
        offerSdp?: string;
        answerSdp?: string;
        iceServers?: Array<{
            urls: string | string[];
            username?: string;
            credential?: string;
        }>;
    };
    media: {
        hasVideo: boolean;
        hasAudio: boolean;
        codec?: string;
        width?: number;
        height?: number;
        fps?: number;
    };
    metrics?: {
        startupDelayMs?: number;
        targetLatencyMs?: number;
        bitrateKbps?: number;
    };
    fallbackStreamUrl?: string;
    error?: {
        code: string;
        message: string;
    };
}

export interface CameraPlaybackSession {
    sessionId: string;
    cameraId: CameraId;
    from: Date | null;
    to: Date | null;
    transport: 'hls';
    status:
        | 'creating'
        | 'ready'
        | 'failed'
        | 'expired';
    expiresAt: Date | null;
    manifestUrl?: string;
    error?: {
        code: string;
        message: string;
    };
}

export interface CameraOverlayObject {
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

export interface CameraOverlayZone {
    id: string;
    label: string;
    polygon: Array<{
        x: number;
        y: number;
    }>;
}

export interface CameraOverlayFrame {
    cameraId: CameraId;
    sessionId: string;
    timestamp: number;
    objects: CameraOverlayObject[];
    zones: CameraOverlayZone[];
}

export type CameraPlayerState =
    | 'idle'
    | 'creating_session'
    | 'connecting'
    | 'live'
    | 'buffering'
    | 'reconnecting'
    | 'ended'
    | 'unavailable'
    | 'failed';

export interface CameraConnectionCheckDiagnostics {
    hostResolved?: boolean;
    tcpConnected?: boolean;
    authPassed?: boolean;
    describePassed?: boolean;
    responseTimeMs?: number;
}

export interface CameraConnectionCheckDiscoveredDevice {
    vendor?: string;
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
}

export interface CameraConnectionCheckDiscoveredStream {
    codec?: string;
    width?: number;
    height?: number;
    fps?: number;
    hasVideo: boolean;
}

export interface CameraConnectionCheckResult {
    ok: boolean;
    status: CameraConnectionCheckStatus;
    checkToken?: string;
    checkExpiresAt: Date | null;
    diagnostics?: CameraConnectionCheckDiagnostics;
    discoveredDevice?: CameraConnectionCheckDiscoveredDevice;
    discoveredStream?: CameraConnectionCheckDiscoveredStream;
    sourcePreview?: CameraSourceSummary;
    error?: {
        code: CameraConnectionCheckStatus;
        message: string;
    };
}

export function isCameraOnline(camera: Camera): boolean {
    return camera.status === CameraStatus.Online;
}

export function isCameraProblematic(camera: Camera): boolean {
    return camera.status === CameraStatus.Problem;
}

export function getCameraLastSeenAgeMs(
    camera: Camera,
    nowMs: number = Date.now(),
): number | null {
    if (!camera.lastSeenAt) {
        return null;
    }

    const timestamp = camera.lastSeenAt.getTime();

    if (Number.isNaN(timestamp)) {
        return null;
    }

    return Math.max(0, nowMs - timestamp);
}

export const DEFAULT_CAMERA_STALE_AFTER_MS = 5 * 60_000;

export function isCameraStale(
    camera: Camera,
    staleAfterMs: number = DEFAULT_CAMERA_STALE_AFTER_MS,
    nowMs: number = Date.now(),
): boolean {
    const age = getCameraLastSeenAgeMs(camera, nowMs);

    if (age == null) {
        return true;
    }

    return age > staleAfterMs;
}

export function isCameraLiveReady(
    session: CameraLiveSession | null | undefined,
): boolean {
    return Boolean(
        session &&
        session.status === 'ready' &&
        session.media.hasVideo,
    );
}

export function isCameraLiveSessionExpired(
    session: CameraLiveSession | null | undefined,
    nowMs: number = Date.now(),
): boolean {
    if (!session?.expiresAt) {
        return false;
    }

    const expiresAtMs = session.expiresAt.getTime();

    if (Number.isNaN(expiresAtMs)) {
        return false;
    }

    return expiresAtMs <= nowMs;
}

export function resolveCameraVideoProfileForUsage(args: {
    usage: 'grid' | 'details';
    mode: CameraVideoMode;
}): CameraVideoProfile {
    const { usage, mode } = args;

    if (usage === 'grid') {
        return mode === 'processed'
            ? 'processed_grid_preview'
            : 'grid_preview';
    }

    return mode === 'processed'
        ? 'processed_single_hd'
        : 'single_hd';
}