// =====================
// entities/incident/store.ts
// =====================

import type {
    IncidentListFilters,
    IncidentSortOption,
} from './types';
import type {
    IncidentId,
    PaginationRequest,
} from '../../shared/api';

export interface IncidentUIState {
    /**
     * Applied filters for list and metrics queries.
     */
    filters: IncidentListFilters;

    /**
     * Sort options for table/list.
     */
    sort: IncidentSortOption[];

    /**
     * Pagination parameters.
     */
    pagination: PaginationRequest;

    /**
     * Currently opened incident in details view.
     */
    activeIncidentId: IncidentId | null;

    /**
     * Selected incident ids for bulk operations.
     */
    selectedIncidentIds: IncidentId[];

    /**
     * Whether details panel/page state is considered open.
     */
    isDetailsPanelOpen: boolean;
}

export interface IncidentUIStore {
    getState(): IncidentUIState;

    setState(next: IncidentUIState): void;

    patchState(partial: Partial<IncidentUIState>): void;

    clearSelection(): void;

    toggleIncidentSelection(id: IncidentId): void;

    setSelection(ids: IncidentId[]): void;

    openIncidentDetails(id: IncidentId): void;

    closeIncidentDetails(): void;

    applyFilters(filters: IncidentListFilters): void;

    reset(): void;
}

export function selectIncidentFilters(
    state: IncidentUIState,
): IncidentListFilters {
    return state.filters;
}

export function selectIncidentSort(
    state: IncidentUIState,
): IncidentSortOption[] {
    return state.sort;
}

export function selectIncidentPagination(
    state: IncidentUIState,
): PaginationRequest {
    return state.pagination;
}

export function selectActiveIncidentId(
    state: IncidentUIState,
): IncidentId | null {
    return state.activeIncidentId;
}