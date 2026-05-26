// =====================
// features/incident/incident-table/types.ts
// =====================

import type {
    Incident,
    IncidentApiError,
    IncidentFormatterOptions,
    IncidentListQuery,
    IncidentSortOption,
    UseIncidentListQueryOptions,
} from '../../../entities/incident';

export type IncidentTableRowId = Incident['id'];
export type IncidentTableListQueryOptions = UseIncidentListQueryOptions;
export type IncidentTableSort = IncidentSortOption[];

export interface IncidentTableRowMapperOptions {
    formatterOptions?: IncidentFormatterOptions;
    emptyConfidenceValue?: string;
    selectedIncidentIds?: IncidentTableRowId[];
}

export interface IncidentTableRow {
    id: IncidentTableRowId;
    incident: Incident;

    eventTime: string;

    siteId: string;
    siteName: string;

    cameraId: string;
    cameraName: string;

    severity: string;
    type: string;
    dataQualityStatus: string;

    confidence: number | null;
    confidenceLabel: string;

    tags: string[];
    tagsLabel: string;

    isSelected: boolean;
}

export interface IncidentTableQueryView {
    query: IncidentListQuery;

    items: Incident[];
    total: number;

    isIdle: boolean;
    isLoading: boolean;
    isPending: boolean;
    isFetching: boolean;
    isSuccess: boolean;
    isError: boolean;

    status?: string;
    fetchStatus?: string;
    isPlaceholderData?: boolean;

    error: IncidentApiError | null;

    refetch: () => Promise<unknown>;
}

export interface IncidentTableState {
    sort: IncidentTableSort;
    pagination: IncidentListQuery['pagination'];

    activeIncidentId: IncidentTableRowId | null;
    isDetailsPanelOpen: boolean;

    selectedIncidentIds: IncidentTableRowId[];
    selectedCount: number;
    hasSelectedIncidents: boolean;
}

export interface IncidentTableActions {
    setSort(sort: IncidentTableSort): void;
    clearSort(): void;

    setPage(page: number): void;
    setPageSize(pageSize: number): void;
    resetPagination(): void;

    toggleSelection(id: IncidentTableRowId): void;
    setSelection(ids: IncidentTableRowId[]): void;
    clearSelection(): void;

    openDetails(id: IncidentTableRowId): void;
    closeDetails(): void;
}

export interface UseIncidentTableRowsOptions {
    queryOptions?: IncidentTableListQueryOptions;
    mapperOptions?: Omit<IncidentTableRowMapperOptions, 'selectedIncidentIds'>;
}

export interface UseIncidentTableRowsResult {
    query: IncidentTableQueryView;
    rows: IncidentTableRow[];
}

export interface UseIncidentTableResult {
    query: IncidentTableQueryView;
    state: IncidentTableState;
    rows: IncidentTableRow[];
    actions: IncidentTableActions;
}