// =====================
// File: src/features/camera/camera-video/realtime.ts
// Purpose:
//   Realtime refresh orchestration for camera video feature.
//   Works with richer camera video event contract.
// =====================

import {
    useCallback,
    useEffect,
    useRef,
} from 'react';

import {
    useCameraVideoRealtimeSubscription,
    type Camera,
    type CameraVideoMode,
    type CameraVideoProfile,
    type CameraVideoRealtimeEventPayload,
} from '../../../entities/camera';

export interface UseCameraVideoRealtimeRefreshOptions {
    cameraId?: Camera['id'] | null;
    sessionId?: string;
    mode?: CameraVideoMode;
    profile?: CameraVideoProfile;

    onStreamUpdated?: () => Promise<void> | void;
    onSessionFailed?: () => Promise<void> | void;
    onSessionExpired?: () => Promise<void> | void;
    onOverlayUpdated?: (
        event: CameraVideoRealtimeEventPayload,
    ) => Promise<void> | void;
}

export function useCameraVideoRealtimeRefresh(
    options: UseCameraVideoRealtimeRefreshOptions,
): void {
    const {
        cameraId,
        sessionId,
        mode,
        profile,
        onStreamUpdated,
        onSessionFailed,
        onSessionExpired,
        onOverlayUpdated,
    } = options;

    const callbacksRef = useRef({
        onStreamUpdated,
        onSessionFailed,
        onSessionExpired,
        onOverlayUpdated,
    });

    useEffect(() => {
        callbacksRef.current = {
            onStreamUpdated,
            onSessionFailed,
            onSessionExpired,
            onOverlayUpdated,
        };
    }, [
        onStreamUpdated,
        onSessionFailed,
        onSessionExpired,
        onOverlayUpdated,
    ]);

    const handleVideoEvent = useCallback(
        (event: CameraVideoRealtimeEventPayload): void => {
            switch (event.type) {
                case 'stream_updated':
                case 'live_session.created':
                case 'live_session.ready':
                case 'stream.health_changed':
                case 'stream.bitrate_changed':
                case 'stream.fps_changed':
                    void callbacksRef.current.onStreamUpdated?.();
                    break;

                case 'live_session.failed':
                    void callbacksRef.current.onSessionFailed?.();
                    break;

                case 'live_session.expired':
                    void callbacksRef.current.onSessionExpired?.();
                    break;

                case 'overlay.updated':
                    void callbacksRef.current.onOverlayUpdated?.(event);
                    break;

                default:
                    break;
            }
        },
        [],
    );

    useCameraVideoRealtimeSubscription(
        {
            cameraId: cameraId ?? undefined,
            sessionId,
            mode,
            profile,
        },
        cameraId
            ? handleVideoEvent
            : undefined,
    );
}