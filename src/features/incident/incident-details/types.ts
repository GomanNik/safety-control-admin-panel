// =====================
// features/incident/incident-details/types.ts
// =====================

import type {
    Incident,
    IncidentApiError,
    UseIncidentQueryOptions,
} from '../../../entities/incident';

export type IncidentDetailsIncidentId = Incident['id'];
export type IncidentDetailsQueryOptions = UseIncidentQueryOptions;

export interface IncidentDetailsIncidentView {
    incident?: Incident;

    displayTitle?: string;
    displaySubtitle?: string;

    eventTimeLabel?: string;
    severityLabel?: string;
    typeLabel?: string;
    dataQualityStatusLabel?: string;

    siteName?: string;
    cameraName?: string;

    imageUrl?: string;
    clipUrl?: string;

    tags: string[];
    tagsCount: number;

    correlationIds: Incident['correlationIds'];
    correlationCount: number;
}

export interface IncidentDetailsQueryView {
    incidentId: IncidentDetailsIncidentId | null;
    isEnabled: boolean;

    isIdle: boolean;
    isLoading: boolean;
    isPending: boolean;
    isFetching: boolean;
    isError: boolean;
    isSuccess: boolean;

    status?: string;
    fetchStatus?: string;
    isPlaceholderData?: boolean;

    error: IncidentApiError | null;
    incident?: Incident;

    refetch: () => Promise<unknown>;
}

export interface UseIncidentDetailsQueryResult {
    query: IncidentDetailsQueryView;
    incident: IncidentDetailsIncidentView;
}