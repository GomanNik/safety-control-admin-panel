// =====================
// File: src/features/camera/camera-details/hooks.ts
// Purpose:
//   Read-only details resource камеры под новый контракт.
//   Без form state, validation, patch и save.
// =====================

import {
    useCallback,
    useMemo,
} from 'react';

import {
    selectActiveCameraId,
    useCameraQuery,
    useCameraUIStore,
    type Camera,
} from '../../../entities/camera';

import type {
    CameraDetailsFeatureModel,
    CameraDetailsResource,
} from './types';

export interface UseCameraDetailsResourceOptions {
    cameraId?: Camera['id'] | null;
}

export const useCameraDetailsResource = (
    options?: UseCameraDetailsResourceOptions,
): CameraDetailsResource => {
    const explicitCameraId = options?.cameraId ?? null;

    const { state: uiState, actions: ui } = useCameraUIStore();

    const storeActiveCameraId = selectActiveCameraId(uiState);
    const activeCameraId = explicitCameraId ?? storeActiveCameraId ?? null;
    const isOpen = explicitCameraId != null
        ? true
        : Boolean(uiState.isDetailsPanelOpen);

    const queryCameraId = (
        activeCameraId ?? '__camera_details_inactive__'
    ) as Camera['id'];

    const cameraQuery = useCameraQuery(queryCameraId, {
        enabled: activeCameraId != null,
    });

    const camera = cameraQuery.data ?? null;

    const refresh = useCallback(async (): Promise<void> => {
        await cameraQuery.refetch();
    }, [cameraQuery]);

    const open = useCallback(
        (id: Camera['id']): void => {
            ui.openCameraDetails(id);
        },
        [ui],
    );

    const close = useCallback((): void => {
        ui.closeCameraDetails();
    }, [ui]);

    const loading = Boolean(
        !camera &&
        (cameraQuery.isLoading || cameraQuery.isFetching),
    );

    const error = cameraQuery.error ?? null;

    return useMemo<CameraDetailsResource>(
        () => ({
            isOpen,
            activeCameraId,

            camera,
            loading,
            error,

            refresh,

            open,
            close,
        }),
        [
            isOpen,
            activeCameraId,
            camera,
            loading,
            error,
            refresh,
            open,
            close,
        ],
    );
};

export const useCameraDetailsFeatureModel = (
    options?: UseCameraDetailsResourceOptions,
): CameraDetailsFeatureModel => {
    const resource = useCameraDetailsResource(options);

    return useMemo<CameraDetailsFeatureModel>(
        () => ({
            resource,
        }),
        [resource],
    );
};