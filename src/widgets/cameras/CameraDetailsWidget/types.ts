// =====================
// File: src/widgets/cameras/CameraDetailsWidget/types.ts
// Purpose:
//   Типы details widget камеры под новый контракт.
//   Без health / settings / incidents / старой video-модели.
// =====================

import type { HTMLAttributes } from 'react';

import type {
    Camera,
    CameraVideoMode,
} from '../../../entities/camera';

export type CameraDetailsWidgetTone =
    | 'neutral'
    | 'success'
    | 'warning'
    | 'critical';

export interface CameraDetailsWidgetProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    cameraId?: Camera['id'] | null;
    showBackButton?: boolean;
    onBack?: () => void;
    maxRealtimeItems?: number;
}

export interface CameraDetailsWidgetHeaderState {
    title: string;
    subtitle?: string;
    statusLabel: string;
    reasonLabel?: string;
    lastSeenAtLabel?: string;
    tone: CameraDetailsWidgetTone;
}

export interface CameraDetailsWidgetOverviewItem {
    key:
        | 'site'
        | 'location'
        | 'model'
        | 'serialNumber'
        | 'lastSeenAt';
    label: string;
    value: string;
    tone: CameraDetailsWidgetTone;
}

export interface CameraDetailsWidgetRealtimeItem {
    key: string;
    title: string;
    message?: string;
    severity: 'info' | 'success' | 'warning' | 'critical';
    occurredAtLabel: string;
}

export interface CameraDetailsWidgetVideoState {
    sourceUrl?: string;
    mode: CameraVideoMode;
    isAvailable: boolean;
    processedAvailable: boolean;
    availableModes: CameraVideoMode[];
    setMode(mode: CameraVideoMode): void;
    refresh(): Promise<void>;
}

export interface CameraDetailsWidgetViewModel {
    camera: Camera | null;

    header: CameraDetailsWidgetHeaderState;
    overviewItems: CameraDetailsWidgetOverviewItem[];
    realtimeItems: CameraDetailsWidgetRealtimeItem[];
    video: CameraDetailsWidgetVideoState;

    isLoading: boolean;
    isError: boolean;
    isEmpty: boolean;

    loadingLabel: string;
    emptyTitle: string;
    emptySubtitle: string;
    errorTitle: string;
    errorSubtitle: string;

    refreshing: boolean;
    refreshFeedback: string | null;

    deleting: boolean;
    canDelete: boolean;
    deleteErrorMessage: string | null;

    refresh(): Promise<void>;
    back(): void;
    close(): void;
    deleteCurrent(): Promise<void>;
}