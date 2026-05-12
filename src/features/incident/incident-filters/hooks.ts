// =====================
// features/incident/incident-filters/hooks.ts
// =====================

import { useCallback, useMemo } from 'react';

import type {
    IncidentListFilters,
} from '../../../entities/incident';
import {
    useIncidentUIStore,
} from '../../../entities/incident';

import type {
    IncidentFiltersActions,
    IncidentFiltersPatch,
    IncidentFiltersQuery,
    IncidentFiltersSort,
    IncidentFiltersValue,
    IncidentFiltersViewState,
    UseIncidentFiltersResult,
} from './types';
import {
    createEmptyIncidentFilters,
    normalizeIncidentFilters,
    normalizeIncidentPagination,
    normalizeIncidentSort,
    selectIncidentFiltersQuery,
    selectIncidentFiltersStateView,
} from './selectors';

function mergeFilters(
    current: IncidentListFilters,
    patch: IncidentFiltersPatch,
): IncidentFiltersValue {
    return normalizeIncidentFilters({
        ...current,
        ...patch,
    });
}

export function useIncidentFiltersQuery(): IncidentFiltersQuery {
    const { state } = useIncidentUIStore();

    return useMemo(
        () => selectIncidentFiltersQuery(state),
        [state],
    );
}

export function useIncidentFiltersState(): IncidentFiltersViewState {
    const { state } = useIncidentUIStore();

    return useMemo(
        () => selectIncidentFiltersStateView(state),
        [state],
    );
}

export function useIncidentFiltersActions(): IncidentFiltersActions {
    const { state, actions } = useIncidentUIStore();

    const currentStateView = useMemo(
        () => selectIncidentFiltersStateView(state),
        [state],
    );

    const setFilters = useCallback((filters: IncidentFiltersValue) => {
        actions.applyFilters(normalizeIncidentFilters(filters));
    }, [actions]);

    const patchFilters = useCallback((patch: IncidentFiltersPatch) => {
        actions.applyFilters(
            mergeFilters(currentStateView.filters, patch),
        );
    }, [actions, currentStateView.filters]);

    const clearFilters = useCallback(() => {
        actions.applyFilters(createEmptyIncidentFilters());
    }, [actions]);

    const resetFilters = useCallback(() => {
        actions.applyFilters(createEmptyIncidentFilters());
    }, [actions]);

    const setTimeRange = useCallback((value: IncidentFiltersValue['timeRange']) => {
        patchFilters({ timeRange: value });
    }, [patchFilters]);

    const setSiteIds = useCallback((value: IncidentFiltersValue['siteIds']) => {
        patchFilters({ siteIds: value });
    }, [patchFilters]);

    const setCameraIds = useCallback((value: IncidentFiltersValue['cameraIds']) => {
        patchFilters({ cameraIds: value });
    }, [patchFilters]);

    const setSeverities = useCallback((value: IncidentFiltersValue['severities']) => {
        patchFilters({ severities: value });
    }, [patchFilters]);

    const setTypes = useCallback((value: IncidentFiltersValue['types']) => {
        patchFilters({ types: value });
    }, [patchFilters]);

    const setMinConfidence = useCallback((value: IncidentFiltersValue['minConfidence']) => {
        patchFilters({ minConfidence: value });
    }, [patchFilters]);

    const setMaxConfidence = useCallback((value: IncidentFiltersValue['maxConfidence']) => {
        patchFilters({ maxConfidence: value });
    }, [patchFilters]);

    const setConfidenceRange = useCallback((
        minConfidence: IncidentFiltersValue['minConfidence'],
        maxConfidence: IncidentFiltersValue['maxConfidence'],
    ) => {
        patchFilters({ minConfidence, maxConfidence });
    }, [patchFilters]);

    const setSearch = useCallback((value: IncidentFiltersValue['search']) => {
        patchFilters({ search: value });
    }, [patchFilters]);

    const setTags = useCallback((value: IncidentFiltersValue['tags']) => {
        patchFilters({ tags: value });
    }, [patchFilters]);

    const setSort = useCallback((sort: IncidentFiltersSort) => {
        const nextSort = normalizeIncidentSort(sort);
        const nextPagination = normalizeIncidentPagination({
            ...currentStateView.pagination,
            page: 1,
        });

        actions.patchState({
            sort: nextSort,
            pagination: nextPagination,
        });
    }, [actions, currentStateView.pagination]);

    const clearSort = useCallback(() => {
        const nextPagination = normalizeIncidentPagination({
            ...currentStateView.pagination,
            page: 1,
        });

        actions.patchState({
            sort: [],
            pagination: nextPagination,
        });
    }, [actions, currentStateView.pagination]);

    const setPage = useCallback((page: number) => {
        const nextPagination = normalizeIncidentPagination({
            ...currentStateView.pagination,
            page,
        });

        actions.patchState({
            pagination: nextPagination,
        });
    }, [actions, currentStateView.pagination]);

    const setPageSize = useCallback((pageSize: number) => {
        const nextPagination = normalizeIncidentPagination({
            page: 1,
            pageSize,
        });

        actions.patchState({
            pagination: nextPagination,
        });
    }, [actions]);

    const resetPagination = useCallback(() => {
        const nextPagination = normalizeIncidentPagination({
            ...currentStateView.pagination,
            page: 1,
        });

        actions.patchState({
            pagination: nextPagination,
        });
    }, [actions, currentStateView.pagination]);

    return useMemo<IncidentFiltersActions>(() => ({
        setFilters,
        patchFilters,
        clearFilters,
        resetFilters,

        setTimeRange,
        setSiteIds,
        setCameraIds,
        setSeverities,
        setTypes,
        setMinConfidence,
        setMaxConfidence,
        setConfidenceRange,
        setSearch,
        setTags,

        setSort,
        clearSort,

        setPage,
        setPageSize,
        resetPagination,
    }), [
        setFilters,
        patchFilters,
        clearFilters,
        resetFilters,
        setTimeRange,
        setSiteIds,
        setCameraIds,
        setSeverities,
        setTypes,
        setMinConfidence,
        setMaxConfidence,
        setConfidenceRange,
        setSearch,
        setTags,
        setSort,
        clearSort,
        setPage,
        setPageSize,
        resetPagination,
    ]);
}

export function useIncidentFilters(): UseIncidentFiltersResult {
    const state = useIncidentFiltersState();
    const query = useIncidentFiltersQuery();
    const actions = useIncidentFiltersActions();

    return useMemo<UseIncidentFiltersResult>(() => ({
        state,
        query,
        actions,
    }), [state, query, actions]);
}