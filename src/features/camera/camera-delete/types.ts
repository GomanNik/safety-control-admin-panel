// =====================
// src/features/camera/camera-delete/types.ts
// =====================

import type { Camera } from '../../../entities/camera';

export type CameraDeleteErrorCode = 'submit_failed';

export interface CameraDeleteModel {
    deleting: boolean;
    deleteError: unknown;
    deleteErrorCode: CameraDeleteErrorCode | null;
    deleteOne: (cameraId: Camera['id']) => Promise<boolean>;
}