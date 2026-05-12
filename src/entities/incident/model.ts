// =====================
// entities/incident/model.ts
// =====================

import type {
    BoundingBox,
    IncidentMetricBucket,
    IncidentSeverityI18nKey,
    IncidentTypeI18nKey,
} from './types';

import {
    IncidentDataQualityStatus,
    IncidentSeverity,
    IncidentType,
} from './types';

import type {
    CameraId,
    IncidentId,
    SiteId,
} from '../../shared/api';

export interface IncidentLocation {
    siteId: SiteId;
    siteName: string;
    cameraId: CameraId;
    cameraName: string;
    buildingName?: string;
    zoneName?: string;
}

export interface IncidentMetrics {
    totalCount: number;
    bySeverity: IncidentMetricBucket[];
    byType: IncidentMetricBucket[];
    bySite: IncidentMetricBucket[];
    byCamera: IncidentMetricBucket[];
}

export interface Incident {
    id: IncidentId;
    eventId: string;

    createdAt: Date;
    updatedAt: Date;
    eventTime: Date;

    severity: IncidentSeverity;
    type: IncidentType;

    confidence: number | null;

    location: IncidentLocation;

    bbox?: BoundingBox;
    dataQualityStatus?: IncidentDataQualityStatus;

    imageUrl: string;
    clipUrl: string;

    tags: string[];
    correlationIds: IncidentId[];

    extra?: Record<string, unknown>;
}

// --------------------
// i18n keys
// --------------------

export function getIncidentSeverityI18nKey(
    severity: IncidentSeverity,
): IncidentSeverityI18nKey {
    switch (severity) {
        case IncidentSeverity.Info:
            return 'incident.severity.info' as IncidentSeverityI18nKey;
        case IncidentSeverity.Low:
            return 'incident.severity.low' as IncidentSeverityI18nKey;
        case IncidentSeverity.Medium:
            return 'incident.severity.medium' as IncidentSeverityI18nKey;
        case IncidentSeverity.High:
            return 'incident.severity.high' as IncidentSeverityI18nKey;
        case IncidentSeverity.Critical:
        default:
            return 'incident.severity.critical' as IncidentSeverityI18nKey;
    }
}

export function getIncidentTypeI18nKey(
    type: IncidentType,
): IncidentTypeI18nKey {
    switch (type) {
        case IncidentType.MissingHeadgear:
            return 'incident.type.missing_headgear' as IncidentTypeI18nKey;
        case IncidentType.WrongHeadgear:
            return 'incident.type.wrong_headgear' as IncidentTypeI18nKey;
        case IncidentType.MultiplePersons:
            return 'incident.type.multiple_persons' as IncidentTypeI18nKey;
        case IncidentType.OccludedHead:
            return 'incident.type.occluded_head' as IncidentTypeI18nKey;
        case IncidentType.Uncertain:
            return 'incident.type.uncertain' as IncidentTypeI18nKey;
        case IncidentType.Other:
        default:
            return 'incident.type.other' as IncidentTypeI18nKey;
    }
}

export function getIncidentDataQualityStatusI18nKey(
    value: IncidentDataQualityStatus,
): string {
    switch (value) {
        case IncidentDataQualityStatus.Ok:
            return 'incident.dataQuality.ok';
        case IncidentDataQualityStatus.MissingFrame:
            return 'incident.dataQuality.missing_frame';
        case IncidentDataQualityStatus.CorruptedMedia:
            return 'incident.dataQuality.corrupted_media';
        case IncidentDataQualityStatus.MissingContext:
        default:
            return 'incident.dataQuality.missing_context';
    }
}

// --------------------
// Derived helpers
// --------------------

export function incidentHasRequiredMedia(
    incident: Incident,
): boolean {
    return Boolean(
        String(incident.imageUrl ?? '').trim()
        && String(incident.clipUrl ?? '').trim(),
    );
}