// =====================
// File: src/features/camera/camera-details-screen/mappers.ts
// Purpose:
//   Presentation mappers for camera details screen.
// =====================

import type { TFunction } from '../../../shared/i18n';
import {
    formatCameraLastSeenAt,
    formatCameraStatus,
    formatCameraStatusReason,
    type Camera,
} from '../../../entities/camera';

import type {
    CameraDetailsScreenHeaderState,
    CameraDetailsScreenOverviewItem,
} from './types';

type CameraPresentationShape = Camera & {
    displayName?: string | null;
    siteName?: string | null;
    site?: {
        name?: string | null;
    } | null;
};

const normalizeText = (
    value: unknown,
): string | null => {
    const normalized = String(value ?? '').trim();

    return normalized.length > 0
        ? normalized
        : null;
};

export const resolveCameraDetailsScreenTitle = (
    camera: Camera | null,
    t: TFunction,
): string => {
    if (!camera) {
        return t('camera.details.title', {
            defaultValue: 'Camera details',
        });
    }

    const presentableCamera = camera as CameraPresentationShape;

    return (
        normalizeText(presentableCamera.displayName) ??
        normalizeText(camera.name) ??
        normalizeText(camera.id) ??
        t('camera.details.title', {
            defaultValue: 'Camera details',
        })
    );
};

export const resolveCameraDetailsScreenSubtitle = (
    camera: Camera | null,
    t: TFunction,
): string | undefined => {
    if (!camera) {
        return undefined;
    }

    const presentableCamera = camera as CameraPresentationShape;

    const siteLabel = (
        normalizeText(presentableCamera.site?.name) ??
        normalizeText(presentableCamera.siteName) ??
        normalizeText(camera.siteId)
    );

    if (!siteLabel) {
        return undefined;
    }

    return `${t('camera.details.meta.site', { defaultValue: 'Site' })}: ${siteLabel}`;
};

export const buildCameraDetailsScreenHeader = (args: {
    camera: Camera | null;
    t: TFunction;
    locale: string;
}): CameraDetailsScreenHeaderState => {
    const {
        camera,
        t,
        locale,
    } = args;

    return {
        title: resolveCameraDetailsScreenTitle(camera, t),
        subtitle: resolveCameraDetailsScreenSubtitle(camera, t),
        statusLabel: formatCameraStatus(camera?.status, {
            t,
            locale,
        }),
        reasonLabel: camera?.statusReason
            ? formatCameraStatusReason(camera.statusReason, {
                t,
                locale,
            })
            : undefined,
    };
};

export const buildCameraDetailsScreenOverviewItems = (args: {
    camera: Camera | null;
    t: TFunction;
    locale: string;
}): CameraDetailsScreenOverviewItem[] => {
    const {
        camera,
        t,
        locale,
    } = args;

    if (!camera) {
        return [];
    }

    const presentableCamera = camera as CameraPresentationShape;
    const notAvailable = t('common.notAvailable', {
        defaultValue: '—',
    });

    return [
        {
            key: 'site',
            label: t('camera.details.meta.site', {
                defaultValue: 'Site',
            }),
            value:
                normalizeText(presentableCamera.site?.name) ??
                normalizeText(presentableCamera.siteName) ??
                normalizeText(camera.siteId) ??
                notAvailable,
        },
        {
            key: 'location',
            label: t('camera.details.meta.location', {
                defaultValue: 'Location',
            }),
            value: normalizeText(camera.location) ?? notAvailable,
        },
        {
            key: 'model',
            label: t('camera.details.meta.model', {
                defaultValue: 'Model',
            }),
            value: normalizeText(camera.model) ?? notAvailable,
        },
        {
            key: 'serialNumber',
            label: t('camera.details.meta.serialNumber', {
                defaultValue: 'Serial number',
            }),
            value: normalizeText(camera.serialNumber) ?? notAvailable,
        },
        {
            key: 'status',
            label: t('camera.details.summary.status', {
                defaultValue: 'System status',
            }),
            value: formatCameraStatus(camera.status, {
                t,
                locale,
            }),
        },
        {
            key: 'lastSeenAt',
            label: t('camera.details.summary.lastSeenAt', {
                defaultValue: 'Last signal',
            }),
            value: formatCameraLastSeenAt(camera.lastSeenAt, {
                t,
                locale,
            }),
        },
    ];
};