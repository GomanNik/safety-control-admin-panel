// =====================
// File: src/widgets/cameras/CameraDetailsWidget/model/useCameraDetailsWidget.ts
// Purpose:
//   View-model details widget камеры под новый контракт.
//   Widget работает через feature-layer:
//   - useCameraDetailsScreenModel
//   - useCameraDeleteModel
//   Без прямой orchestration логики поверх entity API.
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { useI18nContext } from '../../../../shared/i18n';

import {
    formatCameraLastSeenAt,
    formatCameraStatus,
    formatCameraStatusReason,
    type Camera,
    type CameraStatus,
    type CameraVideoMode,
} from '../../../../entities/camera';

import {
    formatSiteDisplayName,
    formatSiteDisplaySubtitle,
    useSiteQuery,
} from '../../../../entities/site';

import {
    useCameraDeleteModel,
    useCameraDetailsScreenModel,
} from '../../../../features/camera';

import type {
    CameraDetailsWidgetOverviewItem,
    CameraDetailsWidgetRealtimeItem,
    CameraDetailsWidgetTone,
    CameraDetailsWidgetVideoState,
    CameraDetailsWidgetViewModel,
} from '../types';

interface UseCameraDetailsWidgetOptions {
    cameraId?: Camera['id'] | null;
    maxRealtimeItems?: number;
    onBack?: () => void;
}

const normalizeText = (
    value: unknown,
): string => {
    return String(value ?? '').trim();
};

const mapStatusToTone = (
    status: CameraStatus | null | undefined,
): CameraDetailsWidgetTone => {
    switch (status) {
        case 'online':
            return 'success';
        case 'problem':
            return 'warning';
        case 'offline':
            return 'critical';
        default:
            return 'neutral';
    }
};

const buildRefreshFingerprint = (args: {
    camera: Camera | null;
    subtitle?: string;
    video: CameraDetailsWidgetVideoState;
    overviewItems: CameraDetailsWidgetOverviewItem[];
}): string => {
    const {
        camera,
        subtitle,
        video,
        overviewItems,
    } = args;

    return [
        camera?.id ?? '',
        camera?.status ?? '',
        camera?.statusReason ?? '',
        camera?.lastSeenAt?.toISOString?.() ?? '',
        camera?.name ?? '',
        subtitle ?? '',
        video.sourceUrl ?? '',
        video.mode,
        String(video.isAvailable),
        String(video.processedAvailable),
        ...overviewItems.map((item) => `${item.key}:${item.value}`),
    ].join('|');
};

export function useCameraDetailsWidget(
    options?: UseCameraDetailsWidgetOptions,
): CameraDetailsWidgetViewModel {
    const { t, locale } = useI18nContext();

    const screenModel = useCameraDetailsScreenModel({
        cameraId: options?.cameraId ?? null,
        maxRealtimeItems: options?.maxRealtimeItems,
    });

    const deleteModel = useCameraDeleteModel();

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
    const [refreshCompareToken, setRefreshCompareToken] = useState(0);

    const refreshFingerprintBeforeRef = useRef<string | null>(null);

    const camera = screenModel.camera;

    const siteQuery = useSiteQuery(
        ((camera?.siteId ?? '') as Camera['siteId']),
        {
            enabled: Boolean(camera?.siteId),
        },
    );

    const siteLabel = useMemo(() => {
        if (!siteQuery.data) {
            return camera?.siteId
                ? String(camera.siteId)
                : '';
        }

        return formatSiteDisplayName(siteQuery.data, {
            t,
            locale,
        });
    }, [camera?.siteId, locale, siteQuery.data, t]);

    const siteSubtitle = useMemo(() => {
        if (!siteQuery.data) {
            return undefined;
        }

        const subtitle = normalizeText(
            formatSiteDisplaySubtitle(siteQuery.data, {
                t,
                locale,
            }),
        );

        return subtitle || undefined;
    }, [locale, siteQuery.data, t]);

    const subtitle = useMemo(() => {
        const sitePart = normalizeText(siteLabel);
        const subtitlePart = normalizeText(siteSubtitle);

        if (sitePart && subtitlePart) {
            return `${sitePart} · ${subtitlePart}`;
        }

        if (sitePart) {
            return sitePart;
        }

        return undefined;
    }, [siteLabel, siteSubtitle]);

    const overviewItems = useMemo<CameraDetailsWidgetOverviewItem[]>(() => {
        if (!camera) {
            return [];
        }

        return [
            {
                key: 'site',
                label: t('camera.details.meta.site'),
                value: siteLabel || t('common.notAvailable'),
                tone: 'neutral',
            },
            {
                key: 'location',
                label: t('camera.details.meta.location'),
                value: normalizeText(camera.location) || t('common.notAvailable'),
                tone: 'neutral',
            },
            {
                key: 'model',
                label: t('camera.details.meta.model'),
                value: normalizeText(camera.model) || t('common.notAvailable'),
                tone: 'neutral',
            },
            {
                key: 'serialNumber',
                label: t('camera.details.meta.serialNumber'),
                value: normalizeText(camera.serialNumber) || t('common.notAvailable'),
                tone: 'neutral',
            },
            {
                key: 'lastSeenAt',
                label: t('camera.details.summary.lastSeenAt'),
                value: formatCameraLastSeenAt(camera.lastSeenAt, {
                    t,
                    locale,
                }),
                tone: 'neutral',
            },
        ];
    }, [camera, locale, siteLabel, t]);

    const availableModes = useMemo<CameraVideoMode[]>(() => {
        const next = screenModel.video.controls.availableModes as CameraVideoMode[];

        return next.length > 0
            ? [...next]
            : ['original'];
    }, [screenModel.video.controls.availableModes]);

    const video = useMemo<CameraDetailsWidgetVideoState>(() => ({
        sourceUrl: screenModel.video.player.sourceUrl,
        mode: screenModel.video.controls.mode as CameraVideoMode,
        isAvailable: Boolean(screenModel.video.player.isAvailable),
        processedAvailable: availableModes.includes('processed'),
        availableModes,
        setMode(mode) {
            screenModel.video.controls.setMode(mode);
        },
        refresh: screenModel.video.controls.refresh,
    }), [
        availableModes,
        screenModel.video.controls,
        screenModel.video.player.isAvailable,
        screenModel.video.player.sourceUrl,
    ]);

    const realtimeItems = useMemo<CameraDetailsWidgetRealtimeItem[]>(() => {
        return screenModel.realtimeItems.map((item) => ({
            key: item.key,
            title: item.title,
            message: item.message,
            severity: item.severity,
            occurredAtLabel: item.occurredAt.toLocaleString(locale),
        }));
    }, [locale, screenModel.realtimeItems]);

    const refreshFingerprint = useMemo(
        () => buildRefreshFingerprint({
            camera,
            subtitle,
            video,
            overviewItems,
        }),
        [camera, overviewItems, subtitle, video],
    );

    useEffect(() => {
        if (refreshCompareToken === 0 || refreshFingerprintBeforeRef.current == null) {
            return;
        }

        const hasChanged =
            refreshFingerprintBeforeRef.current !== refreshFingerprint;

        setRefreshFeedback(
            hasChanged
                ? t('camera.details.refresh.updated')
                : t('camera.details.refresh.unchanged'),
        );

        refreshFingerprintBeforeRef.current = null;
    }, [
        refreshCompareToken,
        refreshFingerprint,
        t,
    ]);

    useEffect(() => {
        if (!refreshFeedback) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setRefreshFeedback(null);
        }, 3000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [refreshFeedback]);

    useEffect(() => {
        setRefreshFeedback(null);
    }, [options?.cameraId]);

    const refresh = useCallback(async (): Promise<void> => {
        if (isRefreshing) {
            return;
        }

        refreshFingerprintBeforeRef.current = refreshFingerprint;
        setRefreshFeedback(null);
        setIsRefreshing(true);

        try {
            await Promise.all([
                screenModel.refresh(),
                siteQuery.refetch(),
            ]);

            setRefreshCompareToken((prev) => prev + 1);
        } catch {
            refreshFingerprintBeforeRef.current = null;
            setRefreshFeedback(
                t('camera.details.refresh.failed'),
            );
        } finally {
            setIsRefreshing(false);
        }
    }, [
        isRefreshing,
        refreshFingerprint,
        screenModel,
        siteQuery,
        t,
    ]);

    const back = useCallback((): void => {
        if (options?.onBack) {
            options.onBack();
            return;
        }

        screenModel.close();
    }, [options, screenModel]);

    const deleteCurrent = useCallback(async (): Promise<void> => {
        if (!camera || deleteModel.deleting) {
            return;
        }

        const confirmed = typeof window === 'undefined'
            ? true
            : window.confirm(
                t('camera.details.actions.deleteConfirm', {
                    defaultValue: 'Delete this camera?',
                }),
            );

        if (!confirmed) {
            return;
        }

        const deleted = await deleteModel.deleteOne(camera.id);

        if (!deleted) {
            return;
        }

        back();
    }, [back, camera, deleteModel, t]);

    return useMemo<CameraDetailsWidgetViewModel>(
        () => ({
            camera,

            header: {
                title:
                    normalizeText(camera?.name) ||
                    normalizeText(camera?.id) ||
                    t('camera.details.title'),
                subtitle,
                statusLabel: camera
                    ? formatCameraStatus(camera.status, {
                        t,
                        locale,
                    })
                    : t('common.unknown'),
                reasonLabel: camera?.statusReason
                    ? formatCameraStatusReason(camera.statusReason, {
                        t,
                        locale,
                    })
                    : undefined,
                lastSeenAtLabel: camera
                    ? formatCameraLastSeenAt(camera.lastSeenAt, {
                        t,
                        locale,
                    })
                    : undefined,
                tone: mapStatusToTone(camera?.status),
            },

            overviewItems,
            realtimeItems,
            video,

            isLoading: screenModel.isLoading,
            isError: screenModel.isError,
            isEmpty: screenModel.isEmpty,

            loadingLabel: t('camera.details.loading'),
            emptyTitle: t('camera.details.empty.title'),
            emptySubtitle: t('camera.details.empty.subtitle'),
            errorTitle: t('camera.details.error.title'),
            errorSubtitle: t('camera.details.error.subtitle'),

            refreshing: isRefreshing,
            refreshFeedback,

            deleting: deleteModel.deleting,
            canDelete: Boolean(camera),
            deleteErrorMessage: deleteModel.deleteError
                ? t('camera.details.delete.error', {
                    defaultValue: 'Failed to delete camera.',
                })
                : null,

            refresh,
            back,
            close: screenModel.close,
            deleteCurrent,
        }),
        [
            camera,
            deleteModel.deleteError,
            deleteModel.deleting,
            isRefreshing,
            locale,
            overviewItems,
            realtimeItems,
            refresh,
            refreshFeedback,
            screenModel.close,
            screenModel.isEmpty,
            screenModel.isError,
            screenModel.isLoading,
            subtitle,
            t,
            video,
        ],
    );
}