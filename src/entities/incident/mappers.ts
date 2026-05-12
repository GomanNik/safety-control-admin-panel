// =====================
// File: src/entities/incident/mappers.ts
// Purpose:
// - Maps Incident DTO contracts to frontend domain model
// - Converts UI incident filters into HTTP query DTO
// - Preserves multi-site and multi-camera filters for report queries
// =====================

import type {
    IncidentDto,
    IncidentListFilters,
    IncidentListQuery,
    IncidentListQueryDto,
    IncidentMetricsDto,
} from './types';

import type {
    Incident,
    IncidentMetrics,
} from './model';

import {
    IncidentDataQualityStatus,
    IncidentType,
} from './types';

import type { IsoDateTimeString } from '../../shared/api';
import {
    parseIsoDateOrInvalid,
    serializeDateOrUndefined,
} from '../../shared/date/parse';
import { getGlobalLogger } from '../../shared/logging';

const logger = getGlobalLogger()
    .child('entities')
    .child('incident')
    .child('mappers');

function isInvalidDate(
    value: Date,
): boolean {
    return Number.isNaN(value.getTime());
}

function parseDateLike(
    value: unknown,
): Date {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'string') {
        return parseIsoDateOrInvalid(value as IsoDateTimeString);
    }

    if (typeof value === 'number') {
        const milliseconds = value < 1e12
            ? value * 1000
            : value;

        return new Date(milliseconds);
    }

    return new Date(NaN);
}

function normalizeRequiredMediaUrl(
    value: unknown,
    meta: {
        incidentId: string;
        eventId: string;
        field: 'image_url' | 'clip_url';
    },
): string {
    const normalized = String(value ?? '').trim();

    if (normalized) {
        return normalized;
    }

    logger.error('mapIncidentDtoToModel:missingRequiredMediaUrl', meta);

    throw new Error(
        `Incident "${meta.incidentId}" is invalid: ${meta.field} is required`,
    );
}

function sortEnumValues<T extends string>(
    items: readonly T[],
): T[] {
    return [...items].sort((left, right) => left.localeCompare(right));
}

function normalizeIdArray<T extends string>(
    items?: readonly T[],
): T[] {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    return Array.from(
        new Set(
            items
                .map((item) => String(item ?? '').trim())
                .filter(Boolean) as T[],
        ),
    ).sort((left, right) => left.localeCompare(right));
}

export function mapIncidentDtoToModel(
    dto: IncidentDto,
): Incident {
    const location = {
        siteId: dto.site_id,
        siteName: dto.site_name ?? '',
        cameraId: dto.camera_id,
        cameraName: dto.camera_name ?? '',
    };

    if (!location.siteName || !location.cameraName) {
        logger.warn('mapIncidentDtoToModel:missingLocationNames', {
            incidentId: dto.id,
            hasSiteName: Boolean(location.siteName),
            hasCameraName: Boolean(location.cameraName),
        });
    }

    const rawIncidentType = dto.incident_type;
    const validIncidentTypes = Object.values(IncidentType) as IncidentType[];

    const safeIncidentType = validIncidentTypes.includes(rawIncidentType)
        ? rawIncidentType
        : IncidentType.Other;

    if (
        safeIncidentType === IncidentType.Other
        && rawIncidentType
        && rawIncidentType !== IncidentType.Other
    ) {
        logger.warn('mapIncidentDtoToModel:unknownIncidentTypeFallback', {
            incidentId: dto.id,
            rawIncidentType,
            fallback: IncidentType.Other,
        });
    }

    const createdAt = parseDateLike(dto.created_at);
    const updatedAt = parseDateLike(dto.updated_at);
    const eventTime = parseDateLike(dto.event_time);

    if (isInvalidDate(createdAt) || isInvalidDate(updatedAt) || isInvalidDate(eventTime)) {
        logger.warn('mapIncidentDtoToModel:invalidDates', {
            incidentId: dto.id,
            createdAtInvalid: isInvalidDate(createdAt),
            updatedAtInvalid: isInvalidDate(updatedAt),
            eventTimeInvalid: isInvalidDate(eventTime),
        });
    }

    return {
        id: dto.id,
        eventId: dto.event_id,

        createdAt,
        updatedAt,
        eventTime,

        severity: dto.severity,
        type: safeIncidentType,

        confidence: dto.confidence,

        location,

        bbox: dto.bbox,

        dataQualityStatus:
            dto.data_quality_status as IncidentDataQualityStatus | undefined,

        imageUrl: normalizeRequiredMediaUrl(dto.image_url, {
            incidentId: dto.id,
            eventId: dto.event_id,
            field: 'image_url',
        }),
        clipUrl: normalizeRequiredMediaUrl(dto.clip_url, {
            incidentId: dto.id,
            eventId: dto.event_id,
            field: 'clip_url',
        }),

        tags: dto.tags ?? [],
        correlationIds: dto.correlation_ids ?? [],
        extra: dto.extra,
    };
}

export function mapIncidentMetricsDtoToModel(
    dto: IncidentMetricsDto,
): IncidentMetrics {
    return {
        totalCount: dto.total_count,
        bySeverity: dto.by_severity,
        byType: dto.by_type,
        bySite: dto.by_site,
        byCamera: dto.by_camera,
    };
}

function mapFiltersToDto(
    filters: IncidentListFilters,
): Partial<IncidentListQueryDto> {
    const result: Partial<IncidentListQueryDto> = {};

    const from = serializeDateOrUndefined(filters.timeRange?.from);
    if (from) {
        result.from = from as IsoDateTimeString;
    }

    const to = serializeDateOrUndefined(filters.timeRange?.to);
    if (to) {
        result.to = to as IsoDateTimeString;
    }

    const normalizedSiteIds = normalizeIdArray(filters.siteIds);
    if (normalizedSiteIds.length === 1) {
        result.site_id = normalizedSiteIds[0];
    } else if (normalizedSiteIds.length > 1) {
        result.site_ids = normalizedSiteIds;
    }

    const normalizedCameraIds = normalizeIdArray(filters.cameraIds);
    if (normalizedCameraIds.length === 1) {
        result.camera_id = normalizedCameraIds[0];
    } else if (normalizedCameraIds.length > 1) {
        result.camera_ids = normalizedCameraIds;
    }

    if (filters.severities && filters.severities.length > 0) {
        result.severity = sortEnumValues(filters.severities);
    }

    if (filters.types && filters.types.length > 0) {
        result.incident_type = sortEnumValues(filters.types);
    }

    if (typeof filters.minConfidence === 'number') {
        result.min_confidence = filters.minConfidence;
    }

    if (typeof filters.maxConfidence === 'number') {
        result.max_confidence = filters.maxConfidence;
    }

    if (filters.search) {
        result.search = filters.search;
    }

    if (filters.tags && filters.tags.length > 0) {
        result.tags = sortEnumValues(filters.tags);
    }

    return result;
}

export function mapIncidentListQueryToDto(
    query: IncidentListQuery,
): IncidentListQueryDto {
    const filtersDto = mapFiltersToDto(query.filters);

    return {
        page: query.pagination.page,
        pageSize: query.pagination.pageSize,
        sort: query.sort.length > 0
            ? query.sort
            : undefined,
        ...filtersDto,
    };
}

export function mapIncidentMetricsQueryToDto(
    query: IncidentListQuery,
): IncidentListQueryDto {
    const filtersDto = mapFiltersToDto(query.filters);

    return {
        page: 1,
        pageSize: 1,
        sort: undefined,
        ...filtersDto,
    };
}