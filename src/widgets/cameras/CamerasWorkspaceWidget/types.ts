// =====================
// File: src/widgets/cameras/CamerasWorkspaceWidget/types.ts
// Purpose:
//   Типы workspace камер под новый контракт.
//   Без bulk / selection / health / visible columns.
// =====================

import type { HTMLAttributes } from 'react';

import type {
    Camera,
    CameraStatus,
} from '../../../entities/camera';
import type { CameraTableRowVM } from '../../../features/camera';

export interface CamerasWorkspaceWidgetProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    pageSizeOptions?: number[];

    /**
     * Оставлено для обратной совместимости публичного API.
     * В текущем workspace отдельная realtime-лента не рендерится.
     */
    maxRealtimeItems?: number;

    onOpenCameraDetails?: (cameraId: Camera['id']) => void;
}

export interface CamerasWorkspaceSiteOption {
    id: Camera['siteId'];
    label: string;
    subtitle?: string;
}

export interface CamerasWorkspaceFilterFormValues {
    siteQuery: string;
    selectedSiteId: Camera['siteId'] | '';
    search: string;
    statuses: CameraStatus[];
}

export interface CamerasWorkspaceOption<TValue extends string> {
    value: TValue;
    label: string;
}

export interface CamerasWorkspaceWidgetViewModel {
    title: string;
    subtitle?: string;
    loadingLabel: string;

    isLoading: boolean;
    isError: boolean;
    isEmpty: boolean;

    emptyTitle: string;
    emptySubtitle: string;
    errorTitle: string;
    errorSubtitle: string;

    sections: {
        filters: {
            title: string;
            subtitle?: string;
        };
        table: {
            title: string;
            subtitle?: string;
        };
    };

    syncMetaText?: string;

    filters: {
        values: CamerasWorkspaceFilterFormValues;
        siteOptions: CamerasWorkspaceSiteOption[];
        siteSearchLoading: boolean;
        statusOptions: CamerasWorkspaceOption<CameraStatus>[];
        setSiteQuery(value: string): void;
        selectSite(option: CamerasWorkspaceSiteOption): void;
        clearSiteSelection(): void;
        setSearch(value: string): void;
        toggleStatus(value: CameraStatus): void;
        apply(): void;
        reset(): void;
        restore(): void;
    };

    table: {
        rows: CameraTableRowVM[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        pageSizeOptions: number[];
        deletingCameraId: Camera['id'] | null;
        deleteErrorMessage: string | null;
        setPage(nextPage: number): void;
        setPageSize(nextPageSize: number): void;
        openDetails(id: CameraTableRowVM['id']): void;
        deleteCamera(id: CameraTableRowVM['id']): Promise<void>;
    };
}