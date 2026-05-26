// =====================
// File: src/entities/camera/store.ts
// Purpose:
//   Camera UI store.
//   Holds lightweight UI state for camera flows:
//   - filters
//   - pagination
//   - active camera
//   - details panel state
//   - preferred grid/details video mode
// =====================

import { create } from 'zustand';

import type {
    CameraId,
    PaginationRequest,
    SiteId,
} from '../../shared/api';

import type {
    CameraStatus,
    CameraVideoMode,
} from './types';

export interface CameraUIFiltersState {
    siteId?: SiteId;
    statuses?: CameraStatus[];
    search?: string;
}

export interface CameraUIPaginationState extends PaginationRequest {}

export interface CameraUIState {
    filters: CameraUIFiltersState;
    pagination: CameraUIPaginationState;
    activeCameraId: CameraId | null;
    isDetailsPanelOpen: boolean;
    preferredGridVideoMode: CameraVideoMode;
    preferredDetailsVideoMode: CameraVideoMode;
}

export interface CameraUIActions {
    setFilters(next: Partial<CameraUIFiltersState>): void;
    resetFilters(): void;
    setPagination(next: Partial<CameraUIPaginationState>): void;
    resetPagination(): void;
    setActiveCameraId(id: CameraId | null): void;
    openCameraDetails(id: CameraId): void;
    closeCameraDetails(): void;
    setPreferredGridVideoMode(mode: CameraVideoMode): void;
    setPreferredDetailsVideoMode(mode: CameraVideoMode): void;
    reset(): void;
}

export interface CameraUIStore {
    state: CameraUIState;
    actions: CameraUIActions;
}

const DEFAULT_FILTERS: CameraUIFiltersState = {};

const DEFAULT_PAGINATION: CameraUIPaginationState = {
    page: 1,
    pageSize: 25,
};

const DEFAULT_STATE: CameraUIState = {
    filters: DEFAULT_FILTERS,
    pagination: DEFAULT_PAGINATION,
    activeCameraId: null,
    isDetailsPanelOpen: false,
    preferredGridVideoMode: 'original',
    preferredDetailsVideoMode: 'processed',
};

export const useCameraUIStateStore = create<CameraUIStore>((set) => ({
    state: DEFAULT_STATE,
    actions: {
        setFilters(next) {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    filters: {
                        ...store.state.filters,
                        ...next,
                    },
                    pagination: {
                        ...store.state.pagination,
                        page: 1,
                    },
                },
            }));
        },

        resetFilters() {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    filters: DEFAULT_FILTERS,
                    pagination: {
                        ...store.state.pagination,
                        page: 1,
                    },
                },
            }));
        },

        setPagination(next) {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    pagination: {
                        ...store.state.pagination,
                        ...next,
                    },
                },
            }));
        },

        resetPagination() {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    pagination: DEFAULT_PAGINATION,
                },
            }));
        },

        setActiveCameraId(id) {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    activeCameraId: id,
                },
            }));
        },

        openCameraDetails(id) {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    activeCameraId: id,
                    isDetailsPanelOpen: true,
                },
            }));
        },

        closeCameraDetails() {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    isDetailsPanelOpen: false,
                },
            }));
        },

        setPreferredGridVideoMode(mode) {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    preferredGridVideoMode: mode,
                },
            }));
        },

        setPreferredDetailsVideoMode(mode) {
            set((store) => ({
                ...store,
                state: {
                    ...store.state,
                    preferredDetailsVideoMode: mode,
                },
            }));
        },

        reset() {
            set(() => ({
                state: DEFAULT_STATE,
                actions: useCameraUIStateStore.getState().actions,
            }));
        },
    },
}));

export const selectCameraFilters = (
    state: CameraUIState,
): CameraUIFiltersState => state.filters;

export const selectCameraPagination = (
    state: CameraUIState,
): CameraUIPaginationState => state.pagination;

export const selectActiveCameraId = (
    state: CameraUIState,
): CameraId | null => state.activeCameraId;

export const selectIsCameraDetailsPanelOpen = (
    state: CameraUIState,
): boolean => state.isDetailsPanelOpen;

export const selectPreferredGridVideoMode = (
    state: CameraUIState,
): CameraVideoMode => state.preferredGridVideoMode;

export const selectPreferredDetailsVideoMode = (
    state: CameraUIState,
): CameraVideoMode => state.preferredDetailsVideoMode;