// =====================
// File: src/features/camera/camera-table/mappers.ts
// Purpose:
//   UI-mapping камеры в строку таблицы под новый контракт.
// =====================

import type { TFunction } from '../../../shared/i18n';
import type { Camera } from '../../../entities/camera';
import {
    CameraStatus,
    formatCameraLastSeenAt,
    formatCameraStatus,
    isCameraOnline,
    isCameraProblematic,
    isCameraStale,
} from '../../../entities/camera';

import type {
    CameraTableRowCellsVM,
    CameraTableRowVM,
} from './types';

export interface CameraTableI18nOptions {
    t: TFunction;
    locale: string;
    siteLabel?: string;
}

const toStatusTone = (
    status: Camera['status'],
): 'neutral' | 'success' | 'warning' | 'critical' => {
    switch (status) {
        case CameraStatus.Online:
            return 'success';

        case CameraStatus.Problem:
            return 'warning';

        case CameraStatus.Offline:
            return 'critical';

        case CameraStatus.Initializing:
        case CameraStatus.Unknown:
        default:
            return 'neutral';
    }
};

const buildCells = (
    camera: Camera,
    options: CameraTableI18nOptions,
): CameraTableRowCellsVM => {
    const siteText = options.siteLabel?.trim() || String(camera.siteId);
    const statusText = formatCameraStatus(camera.status, {
        t: options.t,
        locale: options.locale,
    });
    const lastSeenText = formatCameraLastSeenAt(camera.lastSeenAt, {
        t: options.t,
        locale: options.locale,
    });

    return {
        name: {
            kind: 'text',
            text: camera.name,
            title: camera.name,
        },

        site: {
            kind: 'text',
            text: siteText,
            title: siteText,
        },

        location: {
            kind: 'text',
            text: camera.location,
            title: camera.location,
        },

        status: {
            kind: 'badge',
            text: statusText,
            tone: toStatusTone(camera.status),
            title: statusText,
        },

        lastSeenAt: {
            kind: 'text',
            text: lastSeenText,
            title: lastSeenText,
        },
    };
};

export const mapCameraToTableRow = (
    camera: Camera,
    options: CameraTableI18nOptions,
): CameraTableRowVM => {
    return {
        id: camera.id,
        camera,
        cells: buildCells(camera, options),
        meta: {
            isOnline: isCameraOnline(camera),
            isProblematic: isCameraProblematic(camera),
            isStale: isCameraStale(camera),
        },
    };
};