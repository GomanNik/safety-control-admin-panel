// =====================
// File: src/widgets/cameras/CamerasWorkspaceWidget/model/useCamerasWorkspaceWidget.ts
// Purpose:
//   View-model workspace камер под новый контракт.
//   Widget работает через feature-layer:
//   - useCameraFilters
//   - useCameraListQuerySource
//   - useCameraWorkspaceRealtimeFeed
//   - useCameraTableModel
//   - useCameraDeleteModel
//   Без дублирования query/filter/realtime orchestration в widget.
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import { useI18nContext } from '../../../../shared/i18n';

import {
    CAMERA_STATUS_VALUES,
    formatCameraLastSeenAt,
    formatCameraStatus,
    useCameraUIStore,
    type Camera,
    type CameraListFilters,
    type CameraStatus,
} from '../../../../entities/camera';

import {
    formatSiteDisplayName,
    formatSiteDisplaySubtitle,
    useSiteListQuery,
    useSiteQuery,
} from '../../../../entities/site';

import {
    useCameraDeleteModel,
    useCameraFilters,
    useCameraListQuerySource,
    useCameraTableModel,
    useCameraWorkspaceRealtimeFeed,
} from '../../../../features/camera';

import type {
    CamerasWorkspaceFilterFormValues,
    CamerasWorkspaceOption,
    CamerasWorkspaceSiteOption,
    CamerasWorkspaceWidgetViewModel,
} from '../types';

interface UseCamerasWorkspaceWidgetOptions {
    pageSizeOptions?: number[];
    onOpenCameraDetails?: (cameraId: Camera['id']) => void;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_SITE_SEARCH_PAGE_SIZE = 8;

const normalizeText = (
    value: unknown,
): string => {
    return String(value ?? '').trim();
};

const uniqPositive = (
    values: readonly number[],
): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();

    values.forEach((value) => {
        const next = Number(value);

        if (!Number.isFinite(next)) {
            return;
        }

        const int = Math.floor(next);

        if (int <= 0 || seen.has(int)) {
            return;
        }

        seen.add(int);
        out.push(int);
    });

    return out.length > 0
        ? out
        : [...DEFAULT_PAGE_SIZE_OPTIONS];
};

const toggleArrayValue = <T,>(
    source: T[],
    value: T,
): T[] => {
    if (source.includes(value)) {
        return source.filter((item) => item !== value);
    }

    return [...source, value];
};

const mapFiltersToFormValues = (
    filters: CameraListFilters,
    selectedSiteLabel?: string,
): CamerasWorkspaceFilterFormValues => {
    return {
        siteQuery: normalizeText(selectedSiteLabel),
        selectedSiteId: filters.siteId ?? '',
        search: normalizeText(filters.search),
        statuses: filters.statuses ? [...filters.statuses] : [],
    };
};

const mapFilterFormValuesToFilters = (
    values: CamerasWorkspaceFilterFormValues,
): CameraListFilters => {
    const filters: CameraListFilters = {};

    if (values.selectedSiteId) {
        filters.siteId = values.selectedSiteId as Camera['siteId'];
    }

    if (values.search) {
        filters.search = values.search;
    }

    if (values.statuses.length > 0) {
        filters.statuses = values.statuses;
    }

    return filters;
};

export function useCamerasWorkspaceWidget(
    options?: UseCamerasWorkspaceWidgetOptions,
): CamerasWorkspaceWidgetViewModel {
    const { t, locale } = useI18nContext();
    const { actions: cameraUiActions } = useCameraUIStore();

    const querySource = useCameraListQuerySource();
    const filtersUseCase = useCameraFilters();
    const tableModel = useCameraTableModel({
        query: querySource.query,
        keepPreviousData: true,
    });
    const realtimeFeed = useCameraWorkspaceRealtimeFeed({
        query: querySource.query,
    });
    const deleteModel = useCameraDeleteModel();

    const [deletingCameraId, setDeletingCameraId] = useState<Camera['id'] | null>(null);

    const appliedSiteId = filtersUseCase.state.value.siteId;
    const appliedSiteQuery = useSiteQuery(
        ((appliedSiteId ?? '') as Camera['siteId']),
        {
            enabled: Boolean(appliedSiteId),
        },
    );

    const appliedSiteLabel = useMemo(() => {
        if (!appliedSiteQuery.data) {
            return '';
        }

        return formatSiteDisplayName(appliedSiteQuery.data, {
            t,
            locale,
        });
    }, [appliedSiteQuery.data, locale, t]);

    const [filterValues, setFilterValues] =
        useState<CamerasWorkspaceFilterFormValues>(
            mapFiltersToFormValues(
                filtersUseCase.state.value,
                appliedSiteLabel,
            ),
        );

    const filterStateKey = useMemo(
        () => JSON.stringify(filtersUseCase.state.value),
        [filtersUseCase.state.value],
    );

    useEffect(() => {
        setFilterValues((prev) => {
            const next = mapFiltersToFormValues(
                filtersUseCase.state.value,
                appliedSiteLabel,
            );

            if (
                next.selectedSiteId &&
                prev.selectedSiteId === next.selectedSiteId &&
                prev.siteQuery.trim().length > 0 &&
                appliedSiteLabel.trim().length === 0
            ) {
                return {
                    ...next,
                    siteQuery: prev.siteQuery,
                };
            }

            return next;
        });
    }, [
        appliedSiteLabel,
        filterStateKey,
        filtersUseCase.state.value,
    ]);

    const siteSearchQuery = useMemo(() => {
        if (filterValues.selectedSiteId) {
            return '';
        }

        return filterValues.siteQuery.trim();
    }, [filterValues.selectedSiteId, filterValues.siteQuery]);

    const siteLookupQuery = useSiteListQuery(
        {
            filters: {
                search: siteSearchQuery || undefined,
            },
            pagination: {
                page: 1,
                pageSize: DEFAULT_SITE_SEARCH_PAGE_SIZE,
            },
        },
        {
            enabled: siteSearchQuery.length > 0,
            keepPreviousData: true,
        },
    );

    const siteOptions = useMemo<CamerasWorkspaceSiteOption[]>(() => {
        const items = siteLookupQuery.data?.items ?? [];

        return items.map((site) => ({
            id: site.id,
            label: formatSiteDisplayName(site, {
                t,
                locale,
            }),
            subtitle: formatSiteDisplaySubtitle(site, {
                t,
                locale,
            }),
        }));
    }, [locale, siteLookupQuery.data?.items, t]);

    const statusOptions = useMemo<CamerasWorkspaceOption<CameraStatus>[]>(() => {
        return CAMERA_STATUS_VALUES.map((value) => ({
            value,
            label: formatCameraStatus(value, {
                t,
                locale,
            }),
        }));
    }, [locale, t]);

    const pageSizeOptions = useMemo(() => {
        return uniqPositive(
            options?.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS,
        );
    }, [options?.pageSizeOptions]);

    const totalPages = Math.max(
        1,
        Math.ceil(
            tableModel.total /
            Math.max(1, querySource.query.pagination.pageSize),
        ),
    );

    const applyFilters = useCallback((): void => {
        filtersUseCase.actions.apply(
            mapFilterFormValuesToFilters(filterValues),
        );
    }, [filterValues, filtersUseCase.actions]);

    const resetFilters = useCallback((): void => {
        setFilterValues(mapFiltersToFormValues({}));
        filtersUseCase.actions.reset();
    }, [filtersUseCase.actions]);

    const restoreFilters = useCallback((): void => {
        filtersUseCase.actions.restore();
    }, [filtersUseCase.actions]);

    const openDetails = useCallback((cameraId: Camera['id']): void => {
        if (options?.onOpenCameraDetails) {
            options.onOpenCameraDetails(cameraId);
            return;
        }

        cameraUiActions.openCameraDetails(cameraId);
    }, [cameraUiActions, options]);

    const deleteCamera = useCallback(async (cameraId: Camera['id']): Promise<void> => {
        if (deleteModel.deleting) {
            return;
        }

        const confirmed = typeof window === 'undefined'
            ? true
            : window.confirm(
                t('camera.workspace.table.deleteConfirm', {
                    defaultValue: 'Delete this camera?',
                }),
            );

        if (!confirmed) {
            return;
        }

        setDeletingCameraId(cameraId);

        try {
            await deleteModel.deleteOne(cameraId);
        } finally {
            setDeletingCameraId(null);
        }
    }, [deleteModel, t]);

    const syncMetaText = realtimeFeed.lastUpdatedAt
        ? `${t('camera.workspace.realtime.lastSync')}: ${formatCameraLastSeenAt(
            realtimeFeed.lastUpdatedAt,
            { t, locale },
        )}`
        : undefined;

    const isLoading = tableModel.loading;
    const isError = Boolean(tableModel.error);
    const isEmpty =
        !isLoading &&
        !isError &&
        tableModel.total === 0;

    return useMemo<CamerasWorkspaceWidgetViewModel>(
        () => ({
            title: t('camera.workspace.title'),
            subtitle: t('camera.workspace.subtitle'),
            loadingLabel: t('camera.workspace.loading'),

            isLoading,
            isError,
            isEmpty,

            emptyTitle: t('camera.workspace.empty.title'),
            emptySubtitle: t('camera.workspace.empty.subtitle'),
            errorTitle: t('camera.workspace.error.title'),
            errorSubtitle: t('camera.workspace.error.subtitle'),

            sections: {
                filters: {
                    title: t('camera.workspace.sections.filters.title'),
                    subtitle: t('camera.workspace.sections.filters.subtitle'),
                },
                table: {
                    title: t('camera.workspace.sections.table.title'),
                    subtitle: t('camera.workspace.sections.table.subtitle'),
                },
            },

            syncMetaText,

            filters: {
                values: filterValues,
                siteOptions,
                siteSearchLoading: siteLookupQuery.isFetching,
                statusOptions,

                setSiteQuery(value) {
                    setFilterValues((prev) => ({
                        ...prev,
                        siteQuery: value,
                        selectedSiteId: '',
                    }));
                },

                selectSite(option) {
                    setFilterValues((prev) => ({
                        ...prev,
                        siteQuery: option.label,
                        selectedSiteId: option.id,
                    }));
                },

                clearSiteSelection() {
                    setFilterValues((prev) => ({
                        ...prev,
                        siteQuery: '',
                        selectedSiteId: '',
                    }));
                },

                setSearch(value) {
                    setFilterValues((prev) => ({
                        ...prev,
                        search: value,
                    }));
                },

                toggleStatus(value) {
                    setFilterValues((prev) => ({
                        ...prev,
                        statuses: toggleArrayValue(prev.statuses, value),
                    }));
                },

                apply: applyFilters,
                reset: resetFilters,
                restore: restoreFilters,
            },

            table: {
                rows: tableModel.rows,
                total: tableModel.total,
                page: querySource.query.pagination.page,
                pageSize: querySource.query.pagination.pageSize,
                totalPages,
                pageSizeOptions,
                deletingCameraId,
                deleteErrorMessage: deleteModel.deleteError
                    ? t('camera.workspace.table.deleteError', {
                        defaultValue: 'Failed to delete camera.',
                    })
                    : null,
                setPage: querySource.actions.setPage,
                setPageSize: querySource.actions.setPageSize,
                openDetails,
                deleteCamera,
            },
        }),
        [
            applyFilters,
            deleteCamera,
            deleteModel.deleteError,
            deletingCameraId,
            filterValues,
            isEmpty,
            isError,
            isLoading,
            locale,
            openDetails,
            pageSizeOptions,
            querySource.actions.setPage,
            querySource.actions.setPageSize,
            querySource.query.pagination.page,
            querySource.query.pagination.pageSize,
            resetFilters,
            restoreFilters,
            siteLookupQuery.isFetching,
            siteOptions,
            statusOptions,
            syncMetaText,
            t,
            tableModel.rows,
            tableModel.total,
            totalPages,
        ],
    );
}