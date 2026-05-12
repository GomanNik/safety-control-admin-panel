// =====================
// features/incident/incident-details/mappers.ts
// =====================

import type {
    Incident,
    IncidentApiError,
    IncidentFormatterOptions,
} from '../../../entities/incident';
import {
    formatIncidentDataQualityStatus,
    formatIncidentDateTime,
    formatIncidentSeverity,
    formatIncidentType,
} from '../../../entities/incident';

import type {
    IncidentDetailsIncidentId,
    IncidentDetailsIncidentView,
    IncidentDetailsQueryView,
} from './types';

interface IncidentDetailsRawQueryLike {
    data?: Incident;
    error?: IncidentApiError | null;

    isLoading?: boolean;
    isFetching?: boolean;
    isSuccess?: boolean;
    isError?: boolean;
    isPending?: boolean;

    status?: string;
    fetchStatus?: string;
    isPlaceholderData?: boolean;

    refetch: () => Promise<unknown>;
}

function joinNonEmpty(
    parts: Array<string | undefined>,
    separator = ' · ',
): string | undefined {
    const normalized = parts
        .map((part) => String(part ?? '').trim())
        .filter(Boolean);

    if (normalized.length === 0) {
        return undefined;
    }

    return normalized.join(separator);
}

export function buildIncidentDetailsView(
    incident?: Incident,
    formatterOptions?: IncidentFormatterOptions,
): IncidentDetailsIncidentView {
    if (!incident) {
        return {
            incident: undefined,

            displayTitle: undefined,
            displaySubtitle: undefined,

            eventTimeLabel: undefined,
            severityLabel: undefined,
            typeLabel: undefined,
            dataQualityStatusLabel: undefined,

            siteName: undefined,
            cameraName: undefined,

            imageUrl: undefined,
            clipUrl: undefined,

            tags: [],
            tagsCount: 0,

            correlationIds: [],
            correlationCount: 0,
        };
    }

    const siteName = incident.location.siteName || incident.location.siteId;
    const cameraName = incident.location.cameraName || incident.location.cameraId;

    const eventTimeLabel = formatIncidentDateTime(
        incident.eventTime,
        formatterOptions,
    );

    const displayTitle = joinNonEmpty([
        siteName,
        cameraName,
    ]);

    const displaySubtitle = joinNonEmpty([
        eventTimeLabel,
        incident.eventId,
    ]);

    return {
        incident,

        displayTitle,
        displaySubtitle,

        eventTimeLabel,
        severityLabel: formatIncidentSeverity(
            incident.severity,
            formatterOptions,
        ),
        typeLabel: formatIncidentType(
            incident.type,
            formatterOptions,
        ),
        dataQualityStatusLabel: formatIncidentDataQualityStatus(
            incident.dataQualityStatus,
            formatterOptions,
        ),

        siteName,
        cameraName,

        imageUrl: incident.imageUrl,
        clipUrl: incident.clipUrl,

        tags: [...incident.tags],
        tagsCount: incident.tags.length,

        correlationIds: [...incident.correlationIds],
        correlationCount: incident.correlationIds.length,
    };
}

export function buildIncidentDetailsQueryView(input: {
    incidentId: IncidentDetailsIncidentId | null;
    isEnabled: boolean;
    rawQuery: IncidentDetailsRawQueryLike;
}): IncidentDetailsQueryView {
    const { incidentId, isEnabled, rawQuery } = input;

    const isPending = typeof rawQuery.isPending === 'boolean'
        ? rawQuery.isPending
        : Boolean(rawQuery.isLoading);

    const isLoading = typeof rawQuery.isLoading === 'boolean'
        ? rawQuery.isLoading
        : isPending;

    return {
        incidentId,
        isEnabled,

        isIdle: !isEnabled,
        isLoading,
        isPending,
        isFetching: Boolean(rawQuery.isFetching),
        isError: Boolean(rawQuery.isError),
        isSuccess: Boolean(rawQuery.isSuccess),

        status: typeof rawQuery.status === 'string'
            ? rawQuery.status
            : undefined,
        fetchStatus: typeof rawQuery.fetchStatus === 'string'
            ? rawQuery.fetchStatus
            : undefined,
        isPlaceholderData: typeof rawQuery.isPlaceholderData === 'boolean'
            ? rawQuery.isPlaceholderData
            : undefined,

        error: rawQuery.error ?? null,
        incident: rawQuery.data,

        refetch: () => rawQuery.refetch(),
    };
}