// =====================
// File: src/features/camera/camera-video/types.ts
// Purpose:
//   Video feature types for camera domain.
//   The feature now works with live session lifecycle first
//   and keeps legacy stream url only as temporary browser fallback.
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

export interface CameraVideoPlayerState {
    sourceUrl?: string;

    mode: CameraVideoMode;
    profile: CameraVideoProfile;

    playerState: CameraPlayerState;
    sessionStatus:
        | 'idle'
        | 'creating'
        | 'ready'
        | 'failed'
        | 'expired';

    isAvailable: boolean;
    isLive: boolean;
    processedAvailable: boolean;
    hasAudio: boolean;

    sessionId?: string;

    transport?: CameraLiveSession['transport'];
    errorCode?: string;
    errorMessage?: string;

    legacyStream?: CameraVideoStream | null;
}

export interface CameraVideoControls {
    mode: CameraVideoMode;
    profile: CameraVideoProfile;
    availableModes: CameraVideoMode[];

    setMode(mode: CameraVideoMode): void;

    refresh(): Promise<void>;
    reconnect(): Promise<void>;
    close(): Promise<void>;
}

export interface CameraVideoModel {
    isLoading: boolean;
    error: unknown;

    capabilities: CameraVideoCapabilities | null;
    session: CameraLiveSession | null;
    player: CameraVideoPlayerState;

    controls: CameraVideoControls;
}