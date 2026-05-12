// =====================
// File: src/features/camera/camera-video/hooks.ts
// Purpose:
//   Video feature model for camera domain.
//   The feature is session-first:
//   - loads capabilities
//   - creates/manages live session
//   - derives player state
//   - keeps temporary legacy stream fallback for browser rendering
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    useCameraLiveSession,
    useCameraVideoStreamQuery,
    type Camera,
    type CameraVideoMode,
    type CameraVideoProfile,
} from '../../../entities/camera';

import {
    mapCameraLiveSessionToPlayerState,
    resolveAvailableVideoModes,
} from './mappers';
import { useCameraVideoRealtimeRefresh } from './realtime';
import type { CameraVideoModel } from './types';

export interface UseCameraVideoModelOptions {
    cameraId?: Camera['id'] | null;
    defaultMode?: CameraVideoMode;
    usage?: 'grid' | 'details';
    enabled?: boolean;
}

function resolveSafeMode(args: {
    requestedMode: CameraVideoMode;
    availableModes: CameraVideoMode[];
}): CameraVideoMode {
    const {
        requestedMode,
        availableModes,
    } = args;

    return availableModes.includes(requestedMode)
        ? requestedMode
        : (availableModes[0] ?? 'original');
}

export function useCameraVideoModel(
    options: UseCameraVideoModelOptions,
): CameraVideoModel {
    const {
        cameraId = null,
        defaultMode = 'processed',
        usage = 'details',
        enabled = true,
    } = options;

    const queryCameraId = (
        cameraId ?? '__camera_video_inactive__'
    ) as Camera['id'];

    const [mode, setMode] = useState<CameraVideoMode>(
        defaultMode,
    );

    const reconnectInFlightRef = useRef(false);

    useEffect(() => {
        setMode(defaultMode);
    }, [cameraId, defaultMode]);

    const legacyStreamQuery = useCameraVideoStreamQuery(
        {
            cameraId: queryCameraId,
            mode,
        },
        {
            enabled: enabled && cameraId != null,
            refetchIntervalMs: 15_000,
        },
    );

    const liveSessionView = useCameraLiveSession({
        cameraId,
        mode,
        usage,
        enabled: enabled && cameraId != null,
        keepAliveIntervalMs: usage === 'grid'
            ? 25_000
            : 30_000,
    });

    const availableModes = useMemo<CameraVideoMode[]>(
        () => resolveAvailableVideoModes({
            capabilities: liveSessionView.capabilities,
            legacyStream: legacyStreamQuery.data ?? null,
            defaultMode,
        }),
        [
            defaultMode,
            liveSessionView.capabilities,
            legacyStreamQuery.data,
        ],
    );

    const safeMode = useMemo<CameraVideoMode>(
        () => resolveSafeMode({
            requestedMode: mode,
            availableModes,
        }),
        [availableModes, mode],
    );

    useEffect(() => {
        if (mode === safeMode) {
            return;
        }

        setMode(safeMode);
    }, [mode, safeMode]);

    const refresh = useCallback(async (): Promise<void> => {
        if (!cameraId || !enabled) {
            return;
        }

        await Promise.all([
            legacyStreamQuery.refetch(),
            liveSessionView.refresh(),
        ]);
    }, [
        cameraId,
        enabled,
        legacyStreamQuery,
        liveSessionView,
    ]);

    const reconnect = useCallback(async (): Promise<void> => {
        if (!cameraId || !enabled || reconnectInFlightRef.current) {
            return;
        }

        reconnectInFlightRef.current = true;

        try {
            await Promise.all([
                liveSessionView.reconnect(),
                legacyStreamQuery.refetch(),
            ]);
        } finally {
            reconnectInFlightRef.current = false;
        }
    }, [
        cameraId,
        enabled,
        legacyStreamQuery,
        liveSessionView,
    ]);

    const close = useCallback(async (): Promise<void> => {
        await liveSessionView.close();
    }, [liveSessionView]);

    useCameraVideoRealtimeRefresh({
        cameraId,
        sessionId: liveSessionView.session?.sessionId,
        mode: safeMode,
        profile: liveSessionView.effectiveProfile ?? undefined,
        onStreamUpdated: async () => {
            await refresh();
        },
        onSessionFailed: async () => {
            await refresh();
        },
        onSessionExpired: async () => {
            await reconnect();
        },
    });

    const player = useMemo(
        () => mapCameraLiveSessionToPlayerState({
            capabilities: liveSessionView.capabilities,
            session: liveSessionView.session,
            sessionStatus: liveSessionView.sessionStatus,
            mode: safeMode,
            effectiveProfile: liveSessionView.effectiveProfile,
            legacyStream: legacyStreamQuery.data ?? null,
            availableModes,
            error: liveSessionView.error ?? legacyStreamQuery.error ?? null,
        }),
        [
            availableModes,
            legacyStreamQuery.data,
            legacyStreamQuery.error,
            liveSessionView.capabilities,
            liveSessionView.effectiveProfile,
            liveSessionView.error,
            liveSessionView.session,
            liveSessionView.sessionStatus,
            safeMode,
        ],
    );

    const effectiveProfile = (
        player.profile ??
        liveSessionView.effectiveProfile ??
        (safeMode === 'processed'
            ? 'processed_single_hd'
            : 'single_hd')
    ) as CameraVideoProfile;

    const isLoading = Boolean(
        cameraId != null &&
        enabled &&
        (
            liveSessionView.isLoading ||
            (
                legacyStreamQuery.isLoading &&
                !player.sourceUrl
            )
        ),
    );

    const error = liveSessionView.error ?? legacyStreamQuery.error ?? null;

    return useMemo<CameraVideoModel>(
        () => ({
            isLoading,
            error,

            capabilities: liveSessionView.capabilities,
            session: liveSessionView.session,
            player,

            controls: {
                mode: safeMode,
                profile: effectiveProfile,
                availableModes,
                setMode,
                refresh,
                reconnect,
                close,
            },
        }),
        [
            availableModes,
            close,
            effectiveProfile,
            error,
            isLoading,
            liveSessionView.capabilities,
            liveSessionView.session,
            player,
            reconnect,
            refresh,
            safeMode,
        ],
    );
}