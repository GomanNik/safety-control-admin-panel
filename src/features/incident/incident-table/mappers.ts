// =====================
// features/incident/incident-table/mappers.ts
// =====================

import type {
    Incident,
    IncidentFormatterOptions,
} from '../../../entities/incident';
import {
    formatIncidentDataQualityStatus,
    formatIncidentDateTime,
    formatIncidentSeverity,
    formatIncidentType,
} from '../../../entities/incident';

import type {
    IncidentTableRow,
    IncidentTableRowId,
    IncidentTableRowMapperOptions,
} from './types';

export function formatIncidentTableConfidence(
    value: number | null | undefined,
    options?: Pick<IncidentTableRowMapperOptions, 'emptyConfidenceValue'> & {
        formatterOptions?: IncidentFormatterOptions;
    },
): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return options?.emptyConfidenceValue ?? '—';
    }

    return value.toLocaleString(
        options?.formatterOptions?.locale,
        {
            maximumFractionDigits: 2,
        },
    );
}

function createSelectedIncidentIdSet(
    selectedIncidentIds?: readonly IncidentTableRowId[],
): ReadonlySet<IncidentTableRowId> {
    return new Set<IncidentTableRowId>(selectedIncidentIds ?? []);
}

function mapIncidentToTableRowWithSelection(
    incident: Incident,
    selectedSet: ReadonlySet<IncidentTableRowId>,
    options?: IncidentTableRowMapperOptions,
): IncidentTableRow {
    const siteName = incident.location.siteName || incident.location.siteId;
    const cameraName = incident.location.cameraName || incident.location.cameraId;

    return {
        id: incident.id,
        incident,

        eventTime: formatIncidentDateTime(
            incident.eventTime,
            options?.formatterOptions,
        ),

        siteId: incident.location.siteId,
        siteName,

        cameraId: incident.location.cameraId,
        cameraName,

        severity: formatIncidentSeverity(
            incident.severity,
            options?.formatterOptions,
        ),
        type: formatIncidentType(
            incident.type,
            options?.formatterOptions,
        ),
        dataQualityStatus: formatIncidentDataQualityStatus(
            incident.dataQualityStatus,
            options?.formatterOptions,
        ),

        confidence: incident.confidence,
        confidenceLabel: formatIncidentTableConfidence(
            incident.confidence,
            options,
        ),

        tags: [...incident.tags],
        tagsLabel: incident.tags.join(', '),

        isSelected: selectedSet.has(incident.id),
    };
}

export function mapIncidentToTableRow(
    incident: Incident,
    options?: IncidentTableRowMapperOptions,
): IncidentTableRow {
    return mapIncidentToTableRowWithSelection(
        incident,
        createSelectedIncidentIdSet(options?.selectedIncidentIds),
        options,
    );
}

export function mapIncidentListToTableRows(
    incidents: readonly Incident[],
    options?: IncidentTableRowMapperOptions,
): IncidentTableRow[] {
    if (!Array.isArray(incidents) || incidents.length === 0) {
        return [];
    }

    const selectedSet = createSelectedIncidentIdSet(
        options?.selectedIncidentIds,
    );

    return incidents.map((incident) => mapIncidentToTableRowWithSelection(
        incident,
        selectedSet,
        options,
    ));
}