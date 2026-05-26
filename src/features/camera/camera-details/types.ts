// =====================
// File: src/features/camera/camera-details/types.ts
// Purpose:
//   Read-only feature contract для деталей камеры.
//   Здесь больше нет form/patch/save логики.
// =====================

import type { Camera } from '../../../entities/camera';

export type CameraDetailsCameraId = Camera['id'];

export interface CameraDetailsResource {
    isOpen: boolean;
    activeCameraId: CameraDetailsCameraId | null;

    camera: Camera | null;
    loading: boolean;
    error: unknown;

    refresh(): Promise<void>;

    open(id: CameraDetailsCameraId): void;
    close(): void;
}

export interface CameraDetailsFeatureModel {
    resource: CameraDetailsResource;
}