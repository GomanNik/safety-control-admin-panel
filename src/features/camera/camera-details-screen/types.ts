// =====================
// File: src/features/camera/camera-details-screen/types.ts
// Purpose:
//   Screen model for camera details screen.
//   Uses read-only camera details resource,
//   richer session-based video model,
//   and unified realtime feed.
// =====================

import type { Camera } from '../../../entities/camera';
import type { CameraDetailsResource } from '../camera-details';
import type { CameraRealtimeFeedItem } from '../camera-realtime';
import type { CameraVideoModel } from '../camera-video';

export interface CameraDetailsScreenHeaderState {
    title: string;
    subtitle?: string;
    statusLabel: string;
    reasonLabel?: string;
}

export interface CameraDetailsScreenOverviewItem {
    key:
        | 'site'
        | 'location'
        | 'model'
        | 'serialNumber'
        | 'status'
        | 'lastSeenAt';
    label: string;
    value: string;
}

export interface CameraDetailsScreenModel {
    resource: CameraDetailsResource;

    camera: Camera | null;

    header: CameraDetailsScreenHeaderState;
    overviewItems: CameraDetailsScreenOverviewItem[];
    realtimeItems: CameraRealtimeFeedItem[];
    video: CameraVideoModel;

    isLoading: boolean;
    isError: boolean;
    isEmpty: boolean;

    refresh(): Promise<void>;
    close(): void;
}