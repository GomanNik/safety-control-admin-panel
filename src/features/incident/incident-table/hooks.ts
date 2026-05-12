// =====================
// features/incident/incident-table/hooks.ts
// =====================

import { useCallback, useMemo } from 'react';

import type {
    Incident,
    IncidentApiError,
    IncidentFormatterOptions,
    UseIncidentListQueryOptions,
} from '../../../entities/incident';
import {
    selectActiveIncidentId,
    useIncidentListQuery,
    useIncidentUIStore,
} from '../../../entities/incident';
import { useI18nContext } from '../../../shared/i18n';

import {
    normalizeIncidentPagination,
    normalizeIncidentSort,
    useIncidentFiltersQuery,
} from '../incident-filters';

import {
    mapIncidentListToTableRows,
} from './mappers';
import type {
    IncidentTableActions,
    IncidentTableQueryView,
    IncidentTableRowId,
    IncidentTableSort,
    IncidentTableState,
    UseIncidentTableResult,
    UseIncidentTableRowsOptions,
    UseIncidentTableRowsResult,
} from './types';
import {
    normalizeIncidentTableRowId,
    normalizeIncidentTableSelectedIds,
} from './validation';

type RawIncidentListQuery = ReturnType<typeof useIncidentListQuery>;

function resolveIncidentTableQueryEnabled(
    options?: UseIncidentListQueryOptions,
): boolean {
    return options?.enabled ?? true;
}

function buildIncidentTableQueryView(
    query: ReturnType<typeof useIncidentFiltersQuery>,
    rawQuery: RawIncidentListQuery,
    isEnabled: boolean,
): IncidentTableQueryView {
    const compat = rawQuery as RawIncidentListQuery & {
        isPending?: boolean;
        status?: string;
        fetchStatus?: string;
        isPlaceholderData?: boolean;
        error?: IncidentApiError | null;
        data?: {
            items?: Incident[];
            total?: number;
        };
    };

    const items = Array.isArray(compat.data?.items)
        ? compat.data.items
        : [];

    const total = typeof compat.data?.total === 'number'
    && Number.isFinite(compat.data.total)
        ? compat.data.total
        : items.length;

    const isPending = typeof compat.isPending === 'boolean'
        ? compat.isPending
        : Boolean(rawQuery.isLoading);

    const isLoading = typeof rawQuery.isLoading === 'boolean'
        ? rawQuery.isLoading
        : isPending;

    const isIdle = !isEnabled || (
        compat.fetchStatus === 'idle'
        && !isLoading
        && !rawQuery.isFetching
        && !rawQuery.isSuccess
        && !rawQuery.isError
    );

    return {
        query,

        items,
        total,

        isIdle,
        isLoading,
        isPending,
        isFetching: Boolean(rawQuery.isFetching),
        isSuccess: Boolean(rawQuery.isSuccess),
        isError: Boolean(rawQuery.isError),

        status: typeof compat.status === 'string'
            ? compat.status
            : undefined,
        fetchStatus: typeof compat.fetchStatus === 'string'
            ? compat.fetchStatus
            : undefined,
        isPlaceholderData: typeof compat.isPlaceholderData === 'boolean'
            ? compat.isPlaceholderData
            : undefined,

        error: compat.error ?? null,

        refetch: () => rawQuery.refetch() as Promise<unknown>,
    };
}

function useIncidentFormatterOptions(): IncidentFormatterOptions {
    const { t, locale } = useI18nContext();

    return useMemo<IncidentFormatterOptions>(() => ({
        t,
        locale,
    }), [t, locale]);
}

export function useIncidentTableQuery(
    options?: UseIncidentListQueryOptions,
): IncidentTableQueryView {
    const query = useIncidentFiltersQuery();
    const rawQuery = useIncidentListQuery(query, options);
    const isEnabled = resolveIncidentTableQueryEnabled(options);

    return useMemo(
        () => buildIncidentTableQueryView(query, rawQuery, isEnabled),
        [query, rawQuery, isEnabled],
    );
}

export function useIncidentTableState(): IncidentTableState {
    const { state } = useIncidentUIStore();

    return useMemo(() => {
        const selectedIncidentIds = normalizeIncidentTableSelectedIds(
            state.selectedIncidentIds,
        );
        const activeIncidentId = normalizeIncidentTableRowId(
            selectActiveIncidentId(state),
        );

        return {
            sort: normalizeIncidentSort(state.sort),
            pagination: normalizeIncidentPagination(state.pagination),

            activeIncidentId,
            isDetailsPanelOpen: Boolean(state.isDetailsPanelOpen),

            selectedIncidentIds,
            selectedCount: selectedIncidentIds.length,
            hasSelectedIncidents: selectedIncidentIds.length > 0,
        };
    }, [state]);
}

export function useIncidentTableRows(
    options?: UseIncidentTableRowsOptions,
): UseIncidentTableRowsResult {
    const formatterOptions = useIncidentFormatterOptions();
    const query = useIncidentTableQuery(options?.queryOptions);
    const tableState = useIncidentTableState();

    const rows = useMemo(() => mapIncidentListToTableRows(
        query.items,
        {
            ...options?.mapperOptions,
            formatterOptions: {
                ...options?.mapperOptions?.formatterOptions,
                ...formatterOptions,
            },
            selectedIncidentIds: tableState.selectedIncidentIds,
        },
    ), [
        query.items,
        options?.mapperOptions,
        formatterOptions,
        tableState.selectedIncidentIds,
    ]);

    return useMemo<UseIncidentTableRowsResult>(() => ({
        query,
        rows,
    }), [query, rows]);
}

export function useIncidentTableActions(): IncidentTableActions {
    const { state, actions } = useIncidentUIStore();

    const normalizedPagination = useMemo(
        () => normalizeIncidentPagination(state.pagination),
        [state.pagination],
    );

    const setSort = useCallback((sort: IncidentTableSort) => {
        actions.patchState({
            sort: normalizeIncidentSort(sort),
            pagination: normalizeIncidentPagination({
                ...normalizedPagination,
                page: 1,
            }),
        });
    }, [actions, normalizedPagination]);

    const clearSort = useCallback(() => {
        actions.patchState({
            sort: [],
            pagination: normalizeIncidentPagination({
                ...normalizedPagination,
                page: 1,
            }),
        });
    }, [actions, normalizedPagination]);

    const setPage = useCallback((page: number) => {
        actions.patchState({
            pagination: normalizeIncidentPagination({
                ...normalizedPagination,
                page,
            }),
        });
    }, [actions, normalizedPagination]);

    const setPageSize = useCallback((pageSize: number) => {
        actions.patchState({
            pagination: normalizeIncidentPagination({
                page: 1,
                pageSize,
            }),
        });
    }, [actions]);

    const resetPagination = useCallback(() => {
        actions.patchState({
            pagination: normalizeIncidentPagination({
                ...normalizedPagination,
                page: 1,
            }),
        });
    }, [actions, normalizedPagination]);

    const toggleSelection = useCallback((id: IncidentTableRowId) => {
        const normalizedId = normalizeIncidentTableRowId(id);

        if (!normalizedId) {
            return;
        }

        actions.toggleIncidentSelection(normalizedId);
    }, [actions]);

    const setSelection = useCallback((ids: IncidentTableRowId[]) => {
        actions.setSelection(
            normalizeIncidentTableSelectedIds(ids),
        );
    }, [actions]);

    const clearSelection = useCallback(() => {
        actions.clearSelection();
    }, [actions]);

    const openDetails = useCallback((id: IncidentTableRowId) => {
        const normalizedId = normalizeIncidentTableRowId(id);

        if (!normalizedId) {
            return;
        }

        actions.openIncidentDetails(normalizedId);
    }, [actions]);

    const closeDetails = useCallback(() => {
        actions.closeIncidentDetails();
    }, [actions]);

    return useMemo<IncidentTableActions>(() => ({
        setSort,
        clearSort,

        setPage,
        setPageSize,
        resetPagination,

        toggleSelection,
        setSelection,
        clearSelection,

        openDetails,
        closeDetails,
    }), [
        setSort,
        clearSort,
        setPage,
        setPageSize,
        resetPagination,
        toggleSelection,
        setSelection,
        clearSelection,
        openDetails,
        closeDetails,
    ]);
}

export function useIncidentTable(
    options?: UseIncidentTableRowsOptions,
): UseIncidentTableResult {
    const formatterOptions = useIncidentFormatterOptions();
    const query = useIncidentTableQuery(options?.queryOptions);
    const state = useIncidentTableState();
    const actions = useIncidentTableActions();

    const rows = useMemo(() => mapIncidentListToTableRows(
        query.items,
        {
            ...options?.mapperOptions,
            formatterOptions: {
                ...options?.mapperOptions?.formatterOptions,
                ...formatterOptions,
            },
            selectedIncidentIds: state.selectedIncidentIds,
        },
    ), [
        query.items,
        options?.mapperOptions,
        formatterOptions,
        state.selectedIncidentIds,
    ]);

    return useMemo<UseIncidentTableResult>(() => ({
        query,
        state,
        rows,
        actions,
    }), [query, state, rows, actions]);
}