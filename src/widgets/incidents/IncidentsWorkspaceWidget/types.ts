// =====================
// src/widgets/incidents/IncidentsWorkspaceWidget/types.ts
// =====================

import type { HTMLAttributes } from 'react';

import type {
    Incident,
    IncidentSortField,
    SortDirection,
} from '../../../entities/incident';
import type {
    IncidentMetricsSummary,
    IncidentTableRow,
} from '../../../features/incident';

export interface IncidentsWorkspaceWidgetProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    onOpenIncident?: (incidentId: Incident['id']) => void;
}

export interface IncidentWidgetOption {
    value: string;
    label: string;
}

export interface IncidentsWorkspaceFiltersDraft {
    search: string;
    siteIdsText: string;
    cameraIdsText: string;
    tagsText: string;
    from: string;
    to: string;
    minConfidence: string;
    maxConfidence: string;
    severities: string[];
    types: string[];
    pageSize: number;
}

export interface IncidentsWorkspaceFiltersSectionView {
    draft: IncidentsWorkspaceFiltersDraft;
    severityOptions: IncidentWidgetOption[];
    typeOptions: IncidentWidgetOption[];
    pageSizeMin: number;
    pageSizeMax: number;

    minDateValue: string;
    maxDateValue: string;

    onSearchChange(value: string): void;
    onSiteIdsTextChange(value: string): void;
    onCameraIdsTextChange(value: string): void;
    onTagsTextChange(value: string): void;
    onFromChange(value: string): void;
    onToChange(value: string): void;
    onMinConfidenceChange(value: string): void;
    onMaxConfidenceChange(value: string): void;
    onSeveritiesChange(values: string[]): void;
    onTypesChange(values: string[]): void;
    onPageSizeChange(value: number): void;

    onApply(): void;
    onReset(): void;
}

export interface IncidentsWorkspaceMetricsSectionView {
    isLoading: boolean;
    isError: boolean;
    summary?: IncidentMetricsSummary;
    onRetry(): void;
}

export interface IncidentsWorkspaceTableSectionView {
    rows: IncidentTableRow[];
    isLoading: boolean;
    isError: boolean;
    total: number;
    currentPage: number;
    pageSize: number;
    pageCount: number;
    activeSortField?: IncidentSortField;
    activeSortDirection?: SortDirection;

    onRetry(): void;
    onOpenIncident(incidentId: Incident['id']): void;
    onPrevPage(): void;
    onNextPage(): void;
    onSetPage(page: number): void;
    onSort(field: IncidentSortField): void;
}

export interface IncidentsWorkspaceWidgetViewModel {
    title: string;
    subtitle: string;

    filters: IncidentsWorkspaceFiltersSectionView;
    metrics: IncidentsWorkspaceMetricsSectionView;
    table: IncidentsWorkspaceTableSectionView;
}