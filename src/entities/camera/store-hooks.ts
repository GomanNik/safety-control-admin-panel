// =====================
// File: src/entities/camera/store-hooks.ts
// Purpose:
//   Convenience hooks for camera UI store.
// =====================

import type {
    CameraUIActions,
    CameraUIState,
} from './store';
import {
    useCameraUIStateStore,
} from './store';

export interface UseCameraUIStoreResult {
    state: CameraUIState;
    actions: CameraUIActions;
}

export function useCameraUIStore(): UseCameraUIStoreResult {
    const state = useCameraUIStateStore((store) => store.state);
    const actions = useCameraUIStateStore((store) => store.actions);

    return {
        state,
        actions,
    };
}

