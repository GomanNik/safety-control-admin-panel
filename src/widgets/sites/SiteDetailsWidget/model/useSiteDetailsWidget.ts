// =====================
// File: src/widgets/sites/SiteDetailsWidget/model/useSiteDetailsWidget.ts
// Purpose:
// - Widget-level model for site details screen
// - Site camera section is prepared for live stream tiles, not technical cards
// - Uses existing i18n dictionaries without hardcoded RU strings
// - Camera list is intentionally limited to a single page of 20 items
// - Summary buckets are mutually exclusive: online / problematic / offline
// - Site incident count is loaded from real incident query, not hardcoded
// - Uses only confirmed public contracts from current dump
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import { useI18nContext } from '../../../../shared/i18n';

import {
    formatCameraLastSeenAt,
    formatCameraStatus,
    formatCameraStatusReason,
    isCameraStale,
    useCameraListQuery,
    type Camera,
} from '../../../../entities/camera';

import {
    useIncidentListQuery,
} from '../../../../entities/incident';

import {
    formatSiteDisplaySubtitle,
    useSiteQuery,
} from '../../../../entities/site';

import { useSiteDelete } from '../../../../features/site';

import type {
    SiteDetailsFieldItem,
    SiteDetailsWidgetProps,
    SiteDetailsWidgetViewModel,
} from '../types';

type CameraStatusDisplayInput = Parameters<typeof formatCameraStatus>[0];
type CameraReasonDisplayInput = Parameters<typeof formatCameraStatusReason>[0];

type NormalizedCameraStatus =
    | 'online'
    | 'offline'
    | 'problematic'
    | 'degraded'
    | 'initializing'
    | 'unknown';

type NormalizedCameraReason =
    | 'noSignal'
    | 'noFrames'
    | 'streamUnavailable'
    | 'highLatency'
    | 'authFailed'
    | 'detectorUnavailable'
    | 'initializing'
    | 'unknown'
    | '';

type SiteCameraStateKey =
    | 'offline'
    | 'problem'
    | 'initializing'
    | 'unknown'
    | 'stale'
    | 'normal';

const SITE_DETAILS_CAMERA_PAGE_SIZE = 20;
const SITE_DETAILS_INCIDENT_PAGE_SIZE = 1;

function normalizeText(
    value: unknown,
): string {
    return String(value ?? '').trim();
}

function normalizeToken(
    value: unknown,
): string {
    return normalizeText(value)
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s.-]+/g, '_')
        .toLowerCase();
}

function normalizeCameraStatusToken(
    value: unknown,
): NormalizedCameraStatus {
    switch (normalizeToken(value)) {
        case 'online':
            return 'online';

        case 'offline':
            return 'offline';

        case 'problem':
        case 'problematic':
            return 'problematic';

        case 'degraded':
            return 'degraded';

        case 'initializing':
            return 'initializing';

        case 'unknown':
        default:
            return 'unknown';
    }
}

function normalizeCameraReasonToken(
    value: unknown,
): NormalizedCameraReason {
    switch (normalizeToken(value)) {
        case 'no_signal':
            return 'noSignal';

        case 'no_frames':
            return 'noFrames';

        case 'stream_unavailable':
            return 'streamUnavailable';

        case 'high_latency':
            return 'highLatency';

        case 'auth_failed':
            return 'authFailed';

        case 'detector_unavailable':
            return 'detectorUnavailable';

        case 'initializing':
            return 'initializing';

        case 'unknown':
            return 'unknown';

        default:
            return '';
    }
}

function confirmDeleteSite(
    message: string,
): boolean {
    if (typeof window === 'undefined') {
        return true;
    }

    return window.confirm(message);
}

function getErrorMessage(
    value: unknown,
    fallback: string,
): string {
    if (
        value &&
        typeof value === 'object' &&
        'message' in value &&
        typeof (value as { message?: unknown }).message === 'string'
    ) {
        const message = normalizeText(
            (value as { message: string }).message,
        );

        if (message) {
            return message;
        }
    }

    return fallback;
}

function pushField(
    target: SiteDetailsFieldItem[],
    key: string,
    label: string,
    value: unknown,
): void {
    const normalized = normalizeText(value);

    if (!normalized) {
        return;
    }

    target.push({
        key,
        label,
        value: normalized,
    });
}

function formatDateLabel(
    value: unknown,
    locale: string,
): string {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return '—';
    }

    return value.toLocaleString(locale);
}

function getCameraStateKey(
    camera: Camera,
): SiteCameraStateKey {
    const normalizedStatus = normalizeCameraStatusToken(camera.status);

    if (normalizedStatus === 'offline') {
        return 'offline';
    }

    if (normalizedStatus === 'initializing') {
        return 'initializing';
    }

    if (normalizedStatus === 'unknown') {
        return 'unknown';
    }

    if (
        normalizedStatus === 'problematic' ||
        normalizedStatus === 'degraded'
    ) {
        return 'problem';
    }

    if (isCameraStale(camera)) {
        return 'stale';
    }

    return 'normal';
}

function getCameraTone(
    camera: Camera,
): 'normal' | 'warning' | 'critical' {
    const stateKey = getCameraStateKey(camera);

    if (stateKey === 'offline') {
        return 'critical';
    }

    if (stateKey === 'normal') {
        return 'normal';
    }

    return 'warning';
}

function getCameraStateLabel(
    camera: Camera,
    t: ReturnType<typeof useI18nContext>['t'],
): string {
    return t(`site.details.sections.cameras.state.${getCameraStateKey(camera)}`);
}

function getCameraStatusLabel(
    camera: Camera,
    t: ReturnType<typeof useI18nContext>['t'],
    locale: string,
): string {
    const normalizedStatus =
        normalizeCameraStatusToken(camera.status) as CameraStatusDisplayInput;

    return formatCameraStatus(normalizedStatus, {
        t,
        locale,
    });
}

function getCameraReasonText(
    camera: Camera,
    t: ReturnType<typeof useI18nContext>['t'],
    locale: string,
): string {
    const normalizedReason = normalizeCameraReasonToken(
        camera.statusReason,
    );

    if (normalizedReason) {
        return formatCameraStatusReason(
            normalizedReason as CameraReasonDisplayInput,
            {
                t,
                locale,
            },
        );
    }

    switch (getCameraStateKey(camera)) {
        case 'offline':
            return t('site.details.sections.cameras.reason.offline');

        case 'problem':
            return t('site.details.sections.cameras.reason.problem');

        case 'initializing':
            return t('site.details.sections.cameras.reason.initializing');

        case 'stale':
            return t('site.details.sections.cameras.reason.stale');

        case 'unknown':
            return t('site.details.sections.cameras.reason.unknown');

        case 'normal':
        default:
            return t('site.details.sections.cameras.reason.normal');
    }
}

function getCameraSortPriority(
    camera: Camera,
): number {
    const stateKey = getCameraStateKey(camera);

    switch (stateKey) {
        case 'offline':
            return 0;

        case 'problem':
            return 1;

        case 'initializing':
        case 'unknown':
        case 'stale':
            return 2;

        case 'normal':
        default:
            return 3;
    }
}

export function useSiteDetailsWidget(
    props?: Pick<
        SiteDetailsWidgetProps,
        'siteId' | 'onEditSite' | 'onClose' | 'onDeleted' | 'onOpenCameraDetails'
    >,
): SiteDetailsWidgetViewModel {
    const { t, locale } = useI18nContext();

    const siteId = props?.siteId ?? null;

    const [localDeleteError, setLocalDeleteError] = useState<string | null>(null);

    const siteQuery = useSiteQuery(siteId, {
        enabled: siteId != null,
    });

    const cameraListQuery = useCameraListQuery(
        {
            filters: {
                siteId: siteId ?? undefined,
            },
            pagination: {
                page: 1,
                pageSize: SITE_DETAILS_CAMERA_PAGE_SIZE,
            },
        },
        {
            enabled: siteId != null,
            keepPreviousData: true,
        },
    );

    const incidentListQuery = useIncidentListQuery(
        {
            filters: {
                siteIds: siteId ? [siteId] : undefined,
            },
            sort: [],
            pagination: {
                page: 1,
                pageSize: SITE_DETAILS_INCIDENT_PAGE_SIZE,
            },
        },
        {
            enabled: siteId != null,
            keepPreviousData: true,
        },
    );

    const siteDelete = useSiteDelete();

    const site = siteQuery.data ?? null;
    const sourceCameras = cameraListQuery.data?.items ?? [];
    const incidentCount = incidentListQuery.data?.total ?? 0;

    useEffect(() => {
        setLocalDeleteError(null);
    }, [siteId]);

    const cameras = useMemo(() => {
        return [...sourceCameras]
            .sort((left, right) => {
                const priorityDiff =
                    getCameraSortPriority(left) - getCameraSortPriority(right);

                if (priorityDiff !== 0) {
                    return priorityDiff;
                }

                return String(left.name).localeCompare(
                    String(right.name),
                    locale,
                    {
                        sensitivity: 'base',
                        numeric: true,
                    },
                );
            })
            .map((camera) => {
                const statusLabel = getCameraStatusLabel(camera, t, locale);
                const reasonLabel = getCameraReasonText(camera, t, locale);
                const isNormal = getCameraStateKey(camera) === 'normal';

                return {
                    id: camera.id,
                    name: camera.name,
                    tone: getCameraTone(camera),
                    stateLabel: getCameraStateLabel(camera, t),
                    statusLabel: t('site.details.sections.cameras.labels.status', {
                        value: statusLabel,
                    }),
                    reasonLabel: isNormal
                        ? undefined
                        : reasonLabel,
                    lastSeenLabel: t('site.details.sections.cameras.labels.lastSeen', {
                        value: formatCameraLastSeenAt(camera.lastSeenAt, {
                            t,
                            locale,
                        }),
                    }),
                };
            });
    }, [locale, sourceCameras, t]);

    const summary = useMemo(() => {
        let online = 0;
        let problematic = 0;
        let offline = 0;

        sourceCameras.forEach((camera) => {
            const stateKey = getCameraStateKey(camera);

            if (stateKey === 'normal') {
                online += 1;
                return;
            }

            if (stateKey === 'offline') {
                offline += 1;
                return;
            }

            problematic += 1;
        });

        return {
            total: sourceCameras.length,
            online,
            problematic,
            offline,
            incidents: incidentCount,
        };
    }, [incidentCount, sourceCameras]);

    const overviewItems = useMemo<SiteDetailsFieldItem[]>(() => {
        const items: SiteDetailsFieldItem[] = [];

        pushField(items, 'code', t('site.details.fields.code'), site?.code);
        pushField(items, 'region', t('site.details.fields.region'), site?.region);
        pushField(
            items,
            'createdAt',
            t('site.details.fields.createdAt'),
            formatDateLabel(site?.createdAt, locale),
        );
        pushField(
            items,
            'updatedAt',
            t('site.details.fields.updatedAt'),
            formatDateLabel(site?.updatedAt, locale),
        );

        return items;
    }, [locale, site, t]);

    const addressItems = useMemo<SiteDetailsFieldItem[]>(() => {
        const items: SiteDetailsFieldItem[] = [];

        pushField(items, 'country', t('site.details.fields.country'), site?.address?.country);
        pushField(items, 'city', t('site.details.fields.city'), site?.address?.city);
        pushField(items, 'addressLine1', t('site.details.fields.addressLine1'), site?.address?.addressLine1);
        pushField(items, 'postalCode', t('site.details.fields.postalCode'), site?.address?.postalCode);

        return items;
    }, [site, t]);

    const contactItems = useMemo<SiteDetailsFieldItem[]>(() => {
        const items: SiteDetailsFieldItem[] = [];

        pushField(items, 'contactName', t('site.details.fields.contactName'), site?.contact?.name);
        pushField(items, 'contactEmail', t('site.details.fields.contactEmail'), site?.contact?.email);
        pushField(items, 'contactPhone', t('site.details.fields.contactPhone'), site?.contact?.phone);
        pushField(items, 'contactPosition', t('site.details.fields.contactPosition'), site?.contact?.position);

        return items;
    }, [site, t]);

    const deleteSite = useCallback(async (): Promise<void> => {
        if (!siteId) {
            return;
        }

        setLocalDeleteError(null);

        if (!confirmDeleteSite(t('site.details.actions.deleteConfirm'))) {
            return;
        }

        try {
            await siteDelete.remove({
                siteId,
            });

            setLocalDeleteError(null);

            if (props?.onDeleted) {
                props.onDeleted(siteId);
                return;
            }

            props?.onClose?.();
        } catch (error) {
            setLocalDeleteError(
                getErrorMessage(error, t('site.details.delete.failed')),
            );
        }
    }, [
        props,
        siteDelete,
        siteId,
        t,
    ]);

    return {
        siteId,
        site,
        title: normalizeText(site?.name) || t('site.details.title'),
        subtitle: site
            ? formatSiteDisplaySubtitle(site, {
            t,
            locale,
            emptyValue: '',
        }) || null
            : null,
        loading: Boolean(
            siteId != null &&
            (
                (!siteQuery.data && (siteQuery.isLoading || siteQuery.isFetching)) ||
                (!cameraListQuery.data && (cameraListQuery.isLoading || cameraListQuery.isFetching)) ||
                (!incidentListQuery.data && (incidentListQuery.isLoading || incidentListQuery.isFetching))
            )
        ),
        error:
            siteId == null
                ? null
                : (
                    siteQuery.error
                        ? getErrorMessage(siteQuery.error, t('site.details.error.subtitle'))
                        : cameraListQuery.error
                            ? getErrorMessage(cameraListQuery.error, t('site.details.error.subtitle'))
                            : incidentListQuery.error
                                ? getErrorMessage(incidentListQuery.error, t('site.details.error.subtitle'))
                                : null
                ),
        overviewItems,
        addressItems,
        contactItems,
        summary,
        cameras,
        deletingSite: siteDelete.isDeleting,
        deleteSiteError: localDeleteError ?? (
            siteDelete.error
                ? getErrorMessage(siteDelete.error, t('site.details.delete.failed'))
                : null
        ),
        callbacks: {
            editSite() {
                if (siteId) {
                    props?.onEditSite?.(siteId);
                }
            },
            close() {
                props?.onClose?.();
            },
            deleteSite,
            openCameraDetails(cameraId) {
                props?.onOpenCameraDetails?.(cameraId);
            },
        },
    };
}