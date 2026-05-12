// =====================
// File: src/features/camera/camera-filters/types.ts
// Purpose:
//   Feature-level filters use-case for cameras.
//   После упрощения контракта здесь больше нет presets.
// =====================

import type { CameraListFilters } from '../../../entities/camera';

export interface CameraFiltersStorageDriver {
    load(): CameraListFilters | null;
    save(filters: CameraListFilters): void;
    clear(): void;
}

export interface CameraFiltersState {
    value: CameraListFilters;
    lastAppliedAt?: Date;
}

export interface CameraFiltersActions {
    apply(next: CameraListFilters): void;
    reset(): void;
    restore(): void;
    clearPersisted(): void;
}

export interface CameraFiltersUseCase {
    state: CameraFiltersState;
    actions: CameraFiltersActions;
}