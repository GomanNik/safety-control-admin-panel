// =====================
// File: src/features/camera/camera-delete/hooks.ts
// Purpose:
//   Feature-hook deletion for camera.
//   Aligned with simplified camera UI store.
// =====================

import {
    useCallback,
    useMemo,
} from 'react';

import {
    useCameraDeleteMutation,
    useCameraUIStore,
    type Camera,
} from '../../../entities/camera';

import { isMutationPending } from '../_shared/mutation';
import type {
    CameraDeleteErrorCode,
    CameraDeleteModel,
} from './types';

const getCameraDeleteErrorCode = (
    error: unknown,
): CameraDeleteErrorCode | null => {
    return error
        ? 'submit_failed'
        : null;
};

export function useCameraDeleteModel(): CameraDeleteModel {
    const deleteMutation = useCameraDeleteMutation();
    const {
        state: uiState,
        actions: ui,
    } = useCameraUIStore();

    const deleteOne = useCallback(
        async (
            cameraId: Camera['id'],
        ): Promise<boolean> => {
            if (deleteMutation.error) {
                deleteMutation.reset();
            }

            try {
                await deleteMutation.mutateAsync(cameraId);

                if (uiState.activeCameraId === cameraId) {
                    ui.closeCameraDetails();
                }

                return true;
            } catch {
                return false;
            }
        },
        [deleteMutation, ui, uiState.activeCameraId],
    );

    const deleteError = deleteMutation.error ?? null;

    return useMemo<CameraDeleteModel>(
        () => ({
            deleting: isMutationPending(deleteMutation),
            deleteError,
            deleteErrorCode: getCameraDeleteErrorCode(deleteError),
            deleteOne,
        }),
        [deleteMutation, deleteError, deleteOne],
    );
}