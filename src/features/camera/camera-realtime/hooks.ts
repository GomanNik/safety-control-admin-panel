// =====================
// File: src/features/camera/camera-realtime/hooks.ts
// Purpose:
//   Unified realtime feed hooks for camera feature layer.
//   Collects both camera-level and video-level events
//   for a single camera details screen and exposes
//   lightweight workspace sync meta.
// =====================

import {
    useEffect,
    useMemo,
    useState,
} from 'react';

import { useI18nContext } from '../../../shared/i18n';
import {
    useCameraRealtimeQuerySync,
    useCameraRealtimeSubscription,
    useCameraVideoRealtimeSubscription,

} from '../../../entities/camera';

import {
    mapCameraRealtimeEventToFeedItem,
    mapCameraVideoRealtimeEventToFeedItem,
} from './mappers';
import type {
    CameraRealtimeFeedItem,
    CameraRealtimeFeedState,
    CameraWorkspaceRealtimeFeedState,
    UseCameraDetailsRealtimeFeedOptions,
    UseCameraWorkspaceRealtimeFeedOptions,
} from './types';

const appendFeedItem = (args: {
    previous: CameraRealtimeFeedItem[];
    next: CameraRealtimeFeedItem;
    maxItems: number;
}): CameraRealtimeFeedItem[] => {
    const {
        previous,
        next,
        maxItems,
    } = args;

    const filtered = previous.filter((item) => item.key !== next.key);

    return [
        next,
        ...filtered,
    ].slice(0, Math.max(1, maxItems));
};

export interface CameraDetailsRealtimeFeedResult
    extends CameraRealtimeFeedState {}

export function useCameraDetailsRealtimeFeed(
    options?: UseCameraDetailsRealtimeFeedOptions,
): CameraDetailsRealtimeFeedResult {
    const {
        cameraId = null,
        maxItems = 8,
    } = options ?? {};

    const { t, locale } = useI18nContext();

    const [items, setItems] = useState<CameraRealtimeFeedItem[]>([]);

    useEffect(() => {
        setItems([]);
    }, [cameraId]);

    useCameraRealtimeSubscription(
        undefined,
        cameraId
            ? (event) => {
                if (event.camera.id !== cameraId) {
                    return;
                }

                const nextItem = mapCameraRealtimeEventToFeedItem({
                    event,
                    t,
                    locale,
                });

                setItems((previous) => appendFeedItem({
                    previous,
                    next: nextItem,
                    maxItems,
                }));
            }
            : undefined,
    );

    useCameraVideoRealtimeSubscription(
        {
            cameraId: cameraId ?? undefined,
        },
        cameraId
            ? (event) => {
                if (event.cameraId !== cameraId) {
                    return;
                }

                const nextItem = mapCameraVideoRealtimeEventToFeedItem({
                    event,
                    t,
                    locale,
                });

                setItems((previous) => appendFeedItem({
                    previous,
                    next: nextItem,
                    maxItems,
                }));
            }
            : undefined,
    );

    return useMemo<CameraDetailsRealtimeFeedResult>(
        () => ({
            items,
        }),
        [items],
    );
}

export function useCameraWorkspaceRealtimeFeed(
    options: UseCameraWorkspaceRealtimeFeedOptions,
): CameraWorkspaceRealtimeFeedState {
    const sync = useCameraRealtimeQuerySync(options.query);

    return useMemo<CameraWorkspaceRealtimeFeedState>(
        () => ({
            lastUpdatedAt: sync.lastUpdatedAt,
        }),
        [sync.lastUpdatedAt],
    );
}