// =====================
// File: src/widgets/sites/SiteDetailsWidget/types.ts
// Purpose:
// - Public contracts for SiteDetailsWidget
// - Cameras inside site details are rendered as live stream tiles
// - Inline camera CRUD is intentionally removed
// =====================

import type { HTMLAttributes } from 'react';

import type { Camera as CameraModel } from '../../../entities/camera';
import type { Site } from '../../../entities/site';

export interface SiteDetailsWidgetProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    siteId?: Site['id'] | null;
    onEditSite?: (siteId: Site['id']) => void;
    onClose?: () => void;
    onDeleted?: (siteId: Site['id']) => void;
    onOpenCameraDetails?: (cameraId: CameraModel['id']) => void;
}

export interface SiteDetailsFieldItem {
    key: string;
    label: string;
    value: string;
}

export interface SiteDetailsCameraSummary {
    total: number;
    online: number;
    problematic: number;
    offline: number;
    incidents: number;
}

export interface SiteDetailsCameraItem {
    id: CameraModel['id'];
    name: string;
    stateLabel: string;
    statusLabel: string;
    reasonLabel?: string;
    lastSeenLabel: string;
    tone: 'normal' | 'warning' | 'critical';
}

export interface SiteDetailsWidgetViewModel {
    siteId: Site['id'] | null;
    site: Site | null;
    title: string;
    subtitle: string | null;

    loading: boolean;
    error: string | null;

    overviewItems: SiteDetailsFieldItem[];
    addressItems: SiteDetailsFieldItem[];
    contactItems: SiteDetailsFieldItem[];

    summary: SiteDetailsCameraSummary;
    cameras: SiteDetailsCameraItem[];

    deletingSite: boolean;
    deleteSiteError: string | null;

    callbacks: {
        editSite(): void;
        close(): void;
        deleteSite(): Promise<void>;
        openCameraDetails(cameraId: CameraModel['id']): void;
    };
}