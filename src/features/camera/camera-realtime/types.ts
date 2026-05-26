// =====================
// File: src/features/camera/camera-realtime/types.ts
// Purpose:
//   Realtime feed types for camera feature layer.
//   The feed may include both camera-level and video-level events.
// =====================

import type {
    Camera,
    CameraListQuery,
    CameraRealtimeEventPayload,
    CameraVideoRealtimeEventPayload,
} from '../../../entities/camera';

export type CameraRealtimeFeedSeverity =
    | 'info'
    | 'success'
    | 'warning'
    | 'critical';

export type CameraRealtimeFeedSource =
    | 'camera'
    | 'video';

export interface CameraRealtimeFeedItem {
    key: string;
    source: CameraRealtimeFeedSource;
    eventType: string;
    cameraId: Camera['id'];
    sessionId?: string;

    title: string;
    message?: string;
    severity: CameraRealtimeFeedSeverity;
    occurredAt: Date;
}

export interface CameraRealtimeFeedState {
    items: CameraRealtimeFeedItem[];
}

export interface UseCameraDetailsRealtimeFeedOptions {
    cameraId?: Camera['id'] | null;
    maxItems?: number;
}

export interface UseCameraWorkspaceRealtimeFeedOptions {
    query: CameraListQuery;
}

export interface CameraWorkspaceRealtimeFeedState {
    lastUpdatedAt?: Date;
}

export type CameraDetailsRealtimeSourceEvent =
    | CameraRealtimeEventPayload
    | CameraVideoRealtimeEventPayload;