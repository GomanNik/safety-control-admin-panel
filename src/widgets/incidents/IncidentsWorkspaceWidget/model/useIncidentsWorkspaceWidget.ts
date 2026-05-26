// =====================
// src/widgets/incidents/IncidentsWorkspaceWidget/model/useIncidentsWorkspaceWidget.ts
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import type {
    Incident,
    IncidentSeverity,
    IncidentType,
} from '../../../../entities/incident';
import {
    IncidentSortField,
    SortDirection,
} from '../../../../entities/incident';
import {
    useIncidentFilters,
    useIncidentMetrics,
    useIncidentTable,
} from '../../../../features/incident';
import type { TFunction } from '../../../../shared/i18n';
import { useI18nContext } from '../../../../shared/i18n';

import type {
    IncidentWidgetOption,
    IncidentsWorkspaceFiltersDraft,
    IncidentsWorkspaceWidgetViewModel,
} from '../types';

interface UseIncidentsWorkspaceWidgetOptions {
    onOpenIncident?: (incidentId: Incident['id']) => void;
}

const DEFAULT_PAGE_SIZE = 25;
const MIN_PAGE_SIZE = 1;
const MIN_PERIOD_DATE = new Date(2020, 0, 1);

function splitCsv(
    value: string,
): string[] {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function toNumberString(
    value: number | undefined,
): string {
    return typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : '';
}

function formatDateInputValue(
    value: Date | undefined,
): string {
    if (!value || Number.isNaN(value.getTime())) {
        return '';
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function parseDateInputValue(
    value: string,
): Date | undefined {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
        return undefined;
    }

    const parsed = new Date(`${normalized}T00:00:00`);

    return Number.isNaN(parsed.getTime())
        ? undefined
        : parsed;
}

function startOfDay(
    value: Date,
): Date {
    return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        0,
        0,
        0,
        0,
    );
}

function endOfDay(
    value: Date,
): Date {
    return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        23,
        59,
        59,
        999,
    );
}

function clampPageSize(
    value: number,
    max: number,
): number {
    if (!Number.isFinite(value)) {
        return Math.max(MIN_PAGE_SIZE, max);
    }

    const safeMax = Math.max(MIN_PAGE_SIZE, Math.floor(max));
    const safeValue = Math.floor(value);

    return Math.min(
        safeMax,
        Math.max(MIN_PAGE_SIZE, safeValue),
    );
}

function createFiltersDraft(
    input: {
        search?: string;
        siteIds?: string[];
        cameraIds?: string[];
        tags?: string[];
        from?: Date;
        to?: Date;
        minConfidence?: number;
        maxConfidence?: number;
        severities?: string[];
        types?: string[];
        pageSize: number;
        pageSizeMax: number;
    },
): IncidentsWorkspaceFiltersDraft {
    return {
        search: input.search ?? '',
        siteIdsText: (input.siteIds ?? []).join(', '),
        cameraIdsText: (input.cameraIds ?? []).join(', '),
        tagsText: (input.tags ?? []).join(', '),
        from: formatDateInputValue(input.from),
        to: formatDateInputValue(input.to),
        minConfidence: toNumberString(input.minConfidence),
        maxConfidence: toNumberString(input.maxConfidence),
        severities: input.severities ?? [],
        types: input.types ?? [],
        pageSize: clampPageSize(input.pageSize, input.pageSizeMax),
    };
}

function toFiniteNumberOrUndefined(
    value: string,
): number | undefined {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
        return undefined;
    }

    const numeric = Number(normalized);

    return Number.isFinite(numeric)
        ? numeric
        : undefined;
}

function createSeverityOptions(
    t: TFunction,
): IncidentWidgetOption[] {
    return [
        {
            value: 'info',
            label: t('incident.severity.info'),
        },
        {
            value: 'low',
            label: t('incident.severity.low'),
        },
        {
            value: 'medium',
            label: t('incident.severity.medium'),
        },
        {
            value: 'high',
            label: t('incident.severity.high'),
        },
        {
            value: 'critical',
            label: t('incident.severity.critical'),
        },
    ];
}

function createTypeOptions(
    t: TFunction,
): IncidentWidgetOption[] {
    return [
        {
            value: 'missing_headgear',
            label: t('incident.type.missing_headgear'),
        },
        {
            value: 'wrong_headgear',
            label: t('incident.type.wrong_headgear'),
        },
        {
            value: 'multiple_persons',
            label: t('incident.type.multiple_persons'),
        },
        {
            value: 'occluded_head',
            label: t('incident.type.occluded_head'),
        },
        {
            value: 'uncertain',
            label: t('incident.type.uncertain'),
        },
        {
            value: 'other',
            label: t('incident.type.other'),
        },
    ];
}

export function useIncidentsWorkspaceWidget(
    options?: UseIncidentsWorkspaceWidgetOptions,
): IncidentsWorkspaceWidgetViewModel {
    const { t } = useI18nContext();

    const filtersFeature = useIncidentFilters();
    const tableFeature = useIncidentTable({
        queryOptions: {
            keepPreviousData: true,
        },
    });
    const metricsFeature = useIncidentMetrics({
        keepPreviousData: true,
    });

    const pageSizeMax = Math.max(
        MIN_PAGE_SIZE,
        tableFeature.query.total || DEFAULT_PAGE_SIZE,
    );

    const minDateValue = useMemo(
        () => formatDateInputValue(MIN_PERIOD_DATE),
        [],
    );

    const maxDateValue = useMemo(
        () => formatDateInputValue(new Date()),
        [],
    );

    const [draft, setDraft] = useState<IncidentsWorkspaceFiltersDraft>(
        () => createFiltersDraft({
            search: filtersFeature.state.filters.search,
            siteIds: filtersFeature.state.filters.siteIds,
            cameraIds: filtersFeature.state.filters.cameraIds,
            tags: filtersFeature.state.filters.tags,
            from: filtersFeature.state.filters.timeRange?.from,
            to: filtersFeature.state.filters.timeRange?.to,
            minConfidence: filtersFeature.state.filters.minConfidence,
            maxConfidence: filtersFeature.state.filters.maxConfidence,
            severities: filtersFeature.state.filters.severities as string[] | undefined,
            types: filtersFeature.state.filters.types as string[] | undefined,
            pageSize: filtersFeature.state.pagination.pageSize,
            pageSizeMax,
        }),
    );

    useEffect(() => {
        setDraft(createFiltersDraft({
            search: filtersFeature.state.filters.search,
            siteIds: filtersFeature.state.filters.siteIds,
            cameraIds: filtersFeature.state.filters.cameraIds,
            tags: filtersFeature.state.filters.tags,
            from: filtersFeature.state.filters.timeRange?.from,
            to: filtersFeature.state.filters.timeRange?.to,
            minConfidence: filtersFeature.state.filters.minConfidence,
            maxConfidence: filtersFeature.state.filters.maxConfidence,
            severities: filtersFeature.state.filters.severities as string[] | undefined,
            types: filtersFeature.state.filters.types as string[] | undefined,
            pageSize: filtersFeature.state.pagination.pageSize,
            pageSizeMax,
        }));
    }, [
        filtersFeature.state.filters,
        filtersFeature.state.pagination.pageSize,
        pageSizeMax,
    ]);

    const severityOptions = useMemo<IncidentWidgetOption[]>(
        () => createSeverityOptions(t),
        [t],
    );

    const typeOptions = useMemo<IncidentWidgetOption[]>(
        () => createTypeOptions(t),
        [t],
    );

    const updateDraft = useCallback(
        (patch: Partial<IncidentsWorkspaceFiltersDraft>) => {
            setDraft((previous) => ({
                ...previous,
                ...patch,
            }));
        },
        [],
    );

    const applyFilters = useCallback(() => {
        const safePageSize = clampPageSize(draft.pageSize, pageSizeMax);

        const parsedFrom = parseDateInputValue(draft.from);
        const parsedTo = parseDateInputValue(draft.to);

        filtersFeature.actions.setFilters({
            search: draft.search.trim(),
            siteIds: splitCsv(draft.siteIdsText),
            cameraIds: splitCsv(draft.cameraIdsText),
            tags: splitCsv(draft.tagsText),
            severities: draft.severities as IncidentSeverity[],
            types: draft.types as IncidentType[],
            minConfidence: toFiniteNumberOrUndefined(draft.minConfidence),
            maxConfidence: toFiniteNumberOrUndefined(draft.maxConfidence),
            timeRange:
                parsedFrom || parsedTo
                    ? {
                        from: parsedFrom ? startOfDay(parsedFrom) : undefined,
                        to: parsedTo ? endOfDay(parsedTo) : undefined,
                    }
                    : undefined,
        });

        if (safePageSize !== draft.pageSize) {
            setDraft((previous) => ({
                ...previous,
                pageSize: safePageSize,
            }));
        }

        if (safePageSize !== filtersFeature.state.pagination.pageSize) {
            filtersFeature.actions.setPageSize(safePageSize);
        }
    }, [
        draft,
        filtersFeature.actions,
        filtersFeature.state.pagination.pageSize,
        pageSizeMax,
    ]);

    const resetFilters = useCallback(() => {
        filtersFeature.actions.clearFilters();
        filtersFeature.actions.setPageSize(DEFAULT_PAGE_SIZE);
    }, [filtersFeature.actions]);

    const currentSort = tableFeature.state.sort[0];

    const handleSort = useCallback((
        field: IncidentSortField,
    ) => {
        if (!currentSort || currentSort.field !== field) {
            tableFeature.actions.setSort([
                {
                    field,
                    direction: SortDirection.Desc,
                },
            ]);
            return;
        }

        if (currentSort.direction === SortDirection.Desc) {
            tableFeature.actions.setSort([
                {
                    field,
                    direction: SortDirection.Asc,
                },
            ]);
            return;
        }

        tableFeature.actions.clearSort();
    }, [
        currentSort,
        tableFeature.actions,
    ]);

    const handleOpenIncident = useCallback((
        incidentId: Incident['id'],
    ) => {
        options?.onOpenIncident?.(incidentId);
    }, [options]);

    const pageCount = useMemo(() => {
        if (tableFeature.query.total <= 0) {
            return 1;
        }

        return Math.max(
            1,
            Math.ceil(
                tableFeature.query.total /
                tableFeature.state.pagination.pageSize,
            ),
        );
    }, [
        tableFeature.query.total,
        tableFeature.state.pagination.pageSize,
    ]);

    return useMemo<IncidentsWorkspaceWidgetViewModel>(() => ({
        title: t('incidents.workspace.title'),
        subtitle: t('incidents.workspace.subtitle'),

        filters: {
            draft,
            severityOptions,
            typeOptions,
            pageSizeMin: MIN_PAGE_SIZE,
            pageSizeMax,
            minDateValue,
            maxDateValue,

            onSearchChange: (value) => updateDraft({ search: value }),
            onSiteIdsTextChange: (value) => updateDraft({ siteIdsText: value }),
            onCameraIdsTextChange: (value) => updateDraft({ cameraIdsText: value }),
            onTagsTextChange: (value) => updateDraft({ tagsText: value }),
            onFromChange: (value) => updateDraft({ from: value }),
            onToChange: (value) => updateDraft({ to: value }),
            onMinConfidenceChange: (value) => updateDraft({ minConfidence: value }),
            onMaxConfidenceChange: (value) => updateDraft({ maxConfidence: value }),
            onSeveritiesChange: (values) => updateDraft({ severities: values }),
            onTypesChange: (values) => updateDraft({ types: values }),
            onPageSizeChange: (value) => updateDraft({
                pageSize: clampPageSize(value, pageSizeMax),
            }),

            onApply: applyFilters,
            onReset: resetFilters,
        },

        metrics: {
            isLoading: metricsFeature.metricsQuery.isLoading
                || metricsFeature.metricsQuery.isFetching,
            isError: metricsFeature.metricsQuery.isError,
            summary: metricsFeature.summary,
            onRetry: () => {
                void metricsFeature.metricsQuery.refetch();
            },
        },

        table: {
            rows: tableFeature.rows,
            isLoading: tableFeature.query.isLoading || tableFeature.query.isFetching,
            isError: tableFeature.query.isError,
            total: tableFeature.query.total,
            currentPage: tableFeature.state.pagination.page,
            pageSize: tableFeature.state.pagination.pageSize,
            pageCount,
            activeSortField: currentSort?.field,
            activeSortDirection: currentSort?.direction,

            onRetry: () => {
                void tableFeature.query.refetch();
            },
            onOpenIncident: handleOpenIncident,
            onPrevPage: () => {
                if (tableFeature.state.pagination.page > 1) {
                    tableFeature.actions.setPage(tableFeature.state.pagination.page - 1);
                }
            },
            onNextPage: () => {
                if (tableFeature.state.pagination.page < pageCount) {
                    tableFeature.actions.setPage(tableFeature.state.pagination.page + 1);
                }
            },
            onSetPage: (page) => {
                tableFeature.actions.setPage(page);
            },
            onSort: handleSort,
        },
    }), [
        applyFilters,
        currentSort,
        draft,
        handleOpenIncident,
        handleSort,
        maxDateValue,
        metricsFeature.metricsQuery,
        metricsFeature.summary,
        minDateValue,
        pageCount,
        pageSizeMax,
        resetFilters,
        severityOptions,
        t,
        tableFeature.actions,
        tableFeature.query,
        tableFeature.rows,
        tableFeature.state.pagination,
        typeOptions,
        updateDraft,
    ]);
}