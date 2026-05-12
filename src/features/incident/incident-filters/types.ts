// =====================
// features/incident/incident-filters/types.ts
// =====================

import type {
    IncidentListFilters,
    IncidentListQuery,
    IncidentSortOption,
} from '../../../entities/incident';

export type IncidentFiltersValue = IncidentListFilters;
export type IncidentFiltersPatch = Partial<IncidentListFilters>;
export type IncidentFiltersSort = IncidentSortOption[];
export type IncidentFiltersQuery = IncidentListQuery;
export type IncidentFiltersPagination = IncidentListQuery['pagination'];

export interface IncidentFiltersViewState {
    filters: IncidentFiltersValue;
    sort: IncidentFiltersSort;
    pagination: IncidentFiltersPagination;

    hasNonDefaultFilters: boolean;
    hasSorting: boolean;
}

export interface IncidentFiltersActions {
    setFilters(filters: IncidentFiltersValue): void;
    patchFilters(patch: IncidentFiltersPatch): void;
    clearFilters(): void;
    resetFilters(): void;

    setTimeRange(value: IncidentFiltersValue['timeRange']): void;
    setSiteIds(value: IncidentFiltersValue['siteIds']): void;
    setCameraIds(value: IncidentFiltersValue['cameraIds']): void;
    setSeverities(value: IncidentFiltersValue['severities']): void;
    setTypes(value: IncidentFiltersValue['types']): void;
    setMinConfidence(value: IncidentFiltersValue['minConfidence']): void;
    setMaxConfidence(value: IncidentFiltersValue['maxConfidence']): void;
    setConfidenceRange(
        minConfidence: IncidentFiltersValue['minConfidence'],
        maxConfidence: IncidentFiltersValue['maxConfidence'],
    ): void;
    setSearch(value: IncidentFiltersValue['search']): void;
    setTags(value: IncidentFiltersValue['tags']): void;

    setSort(sort: IncidentFiltersSort): void;
    clearSort(): void;

    setPage(page: number): void;
    setPageSize(pageSize: number): void;
    resetPagination(): void;
}

export interface UseIncidentFiltersResult {
    state: IncidentFiltersViewState;
    query: IncidentFiltersQuery;
    actions: IncidentFiltersActions;
}