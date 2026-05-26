// =====================
// File: src/features/camera/camera-details-screen/hooks.ts
// Purpose:
//   Screen model for camera details:
//   - read-only camera details
//   - richer session-based video
//   - unified realtime feed
// =====================

import {
    useCallback,
    useMemo,
} from 'react';

import { useI18nContext } from '../../../shared/i18n';

import {
    isCameraLiveReady,
    type Camera,
    useCameraRealtimeSubscription,
} from '../../../entities/camera';

import { useCameraDetailsFeatureModel } from '../camera-details';
import { useCameraDetailsRealtimeFeed } from '../camera-realtime';
import { useCameraVideoModel } from '../camera-video';

import {
    buildCameraDetailsScreenHeader,
    buildCameraDetailsScreenOverviewItems,
} from './mappers';
import type { CameraDetailsScreenModel } from './types';

export interface UseCameraDetailsScreenModelOptions {
    cameraId?: Camera['id'] | null;
    maxRealtimeItems?: number;
}

export const useCameraDetailsScreenModel = (
    options?: UseCameraDetailsScreenModelOptions,
): CameraDetailsScreenModel => {
    const { t, locale } = useI18nContext();

    const detailsFeature = useCameraDetailsFeatureModel({
        cameraId: options?.cameraId ?? null,
    });

    const { resource } = detailsFeature;
    const camera = resource.camera;
    const maxRealtimeItems = options?.maxRealtimeItems ?? 8;

    const videoModel = useCameraVideoModel({
        cameraId: resource.activeCameraId,
        usage: 'details',
    });

    const realtimeFeed = useCameraDetailsRealtimeFeed({
        cameraId: resource.activeCameraId,
        maxItems: maxRealtimeItems,
    });

    const header = useMemo(
        () => buildCameraDetailsScreenHeader({
            camera,
            t,
            locale,
        }),
        [camera, locale, t],
    );

    const overviewItems = useMemo(
        () => buildCameraDetailsScreenOverviewItems({
            camera,
            t,
            locale,
        }),
        [camera, locale, t],
    );

    const refresh = useCallback(async (): Promise<void> => {
        await Promise.all([
            resource.refresh(),
            videoModel.controls.refresh(),
        ]);
    }, [resource, videoModel.controls]);

    const handleCameraRealtimeEvent = useCallback(async (event: {
        type: string;
    }): Promise<void> => {
        const shouldRefreshVideo =
            event.type === 'status_changed' ||
            event.type === 'camera.status_changed' ||
            event.type === 'camera.runtime_changed' ||
            !isCameraLiveReady(videoModel.session);

        await Promise.all([
            resource.refresh(),
            shouldRefreshVideo
                ? videoModel.controls.refresh()
                : Promise.resolve(),
        ]);
    }, [resource, videoModel.controls, videoModel.session]);

    useCameraRealtimeSubscription(
        undefined,
        resource.activeCameraId
            ? (event) => {
                if (event.camera.id !== resource.activeCameraId) {
                    return;
                }

                void handleCameraRealtimeEvent({
                    type: event.type,
                });
            }
            : undefined,
    );

    return useMemo<CameraDetailsScreenModel>(
        () => {
            const isLoading = resource.loading;
            const isError = Boolean(resource.error);
            const isEmpty = !isLoading && !isError && !camera;

            return {
                resource,

                camera,

                header,
                overviewItems,
                realtimeItems: realtimeFeed.items,
                video: videoModel,

                isLoading,
                isError,
                isEmpty,

                refresh,
                close: resource.close,
            };
        },
        [
            resource,
            camera,
            header,
            overviewItems,
            realtimeFeed.items,
            videoModel,
            refresh,
        ],
    );
};