// =====================
// File: src/features/camera/camera-video/mappers.ts
// Purpose:
//   Video feature mappers for camera domain.
//   Converts entity-level session/capability data into player state
//   consumable by widgets.
// =====================

import type {
    CameraLiveSession,
    CameraPlayerState,
    CameraVideoCapabilities,
    CameraVideoStream,
} from '../../../entities/camera';
import type {
    CameraVideoMode,
    CameraVideoProfile,
} from '../../../entities/camera';

import type {
    CameraVideoPlayerState,
} from './types';

const DEFAULT_AVAILABLE_MODES: CameraVideoMode[] = ['original'];

export const resolveAvailableVideoModes = (args: {
    capabilities: CameraVideoCapabilities | null;
    legacyStream: CameraVideoStream | null;
    defaultMode?: CameraVideoMode;
}): CameraVideoMode[] => {
    const {
        capabilities,
        legacyStream,
        defaultMode = 'original',
    } = args;

    if (capabilities?.modes && capabilities.modes.length > 0) {
        const unique = Array.from(new Set(capabilities.modes));

        return unique.length > 0
            ? unique
            : DEFAULT_AVAILABLE_MODES;
    }

    if (legacyStream?.processedAvailable) {
        return ['processed', 'original'];
    }

    return defaultMode === 'processed'
        ? ['processed', 'original']
        : DEFAULT_AVAILABLE_MODES;
};

const resolveSourceUrl = (args: {
    session: CameraLiveSession | null;
    legacyStream: CameraVideoStream | null;
}): string | undefined => {
    const {
        session,
        legacyStream,
    } = args;

    if (session?.fallbackStreamUrl) {
        return session.fallbackStreamUrl;
    }

    return legacyStream?.streamUrl ?? undefined;
};

const resolveProfile = (args: {
    session: CameraLiveSession | null;
    effectiveProfile: CameraVideoProfile | null;
    mode: CameraVideoMode;
}): CameraVideoProfile => {
    const {
        session,
        effectiveProfile,
        mode,
    } = args;

    if (session?.profile) {
        return session.profile;
    }

    if (effectiveProfile) {
        return effectiveProfile;
    }

    return mode === 'processed'
        ? 'processed_single_hd'
        : 'single_hd';
};

const resolveHasAudio = (
    session: CameraLiveSession | null,
): boolean => Boolean(session?.media.hasAudio);

const resolveProcessedAvailable = (args: {
    capabilities: CameraVideoCapabilities | null;
    legacyStream: CameraVideoStream | null;
    availableModes: CameraVideoMode[];
}): boolean => {
    const {
        capabilities,
        legacyStream,
        availableModes,
    } = args;

    if (capabilities) {
        return capabilities.modes.includes('processed');
    }

    if (legacyStream) {
        return legacyStream.processedAvailable;
    }

    return availableModes.includes('processed');
};

const resolvePlayerState = (args: {
    session: CameraLiveSession | null;
    sessionStatus: CameraVideoPlayerState['sessionStatus'];
    sourceUrl?: string;
    hasRenderableFallback: boolean;
}): CameraPlayerState => {
    const {
        session,
        sessionStatus,
        sourceUrl,
        hasRenderableFallback,
    } = args;

    if (sessionStatus === 'creating') {
        return 'creating_session';
    }

    if (sessionStatus === 'expired') {
        return 'ended';
    }

    if (sessionStatus === 'failed') {
        return hasRenderableFallback
            ? 'live'
            : 'failed';
    }

    if (sessionStatus === 'ready') {
        if (sourceUrl) {
            return 'live';
        }

        return session?.transport === 'webrtc'
            ? 'connecting'
            : 'unavailable';
    }

    if (sourceUrl) {
        return 'live';
    }

    return 'idle';
};

export const mapCameraLiveSessionToPlayerState = (args: {
    capabilities: CameraVideoCapabilities | null;
    session: CameraLiveSession | null;
    sessionStatus: CameraVideoPlayerState['sessionStatus'];
    mode: CameraVideoMode;
    effectiveProfile: CameraVideoProfile | null;
    legacyStream: CameraVideoStream | null;
    availableModes: CameraVideoMode[];
    error: unknown;
}): CameraVideoPlayerState => {
    const {
        capabilities,
        session,
        sessionStatus,
        mode,
        effectiveProfile,
        legacyStream,
        availableModes,
        error,
    } = args;

    const sourceUrl = resolveSourceUrl({
        session,
        legacyStream,
    });

    const hasRenderableFallback = Boolean(
        legacyStream?.isAvailable &&
        legacyStream.streamUrl,
    );

    const playerState = resolvePlayerState({
        session,
        sessionStatus,
        sourceUrl,
        hasRenderableFallback,
    });

    const isAvailable = Boolean(
        sourceUrl &&
        (
            sessionStatus === 'ready' ||
            hasRenderableFallback
        ),
    );

    const normalizedError = error as {
        code?: string;
        message?: string;
    } | null;

    return {
        sourceUrl,

        mode,
        profile: resolveProfile({
            session,
            effectiveProfile,
            mode,
        }),

        playerState,
        sessionStatus,

        isAvailable,
        isLive: playerState === 'live',
        processedAvailable: resolveProcessedAvailable({
            capabilities,
            legacyStream,
            availableModes,
        }),
        hasAudio: resolveHasAudio(session),

        sessionId: session?.sessionId,
        transport: session?.transport,
        errorCode:
            session?.error?.code ??
            normalizedError?.code,
        errorMessage:
            session?.error?.message ??
            normalizedError?.message,
        legacyStream,
    };
};