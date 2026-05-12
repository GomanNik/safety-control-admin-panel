// =====================
// File: src/entities/incident/types.ts
// Purpose:
// - DTO and query contracts for Incident entity
// - Supports single-site/single-camera filters
// - Supports multi-site/multi-camera filters for reports and aggregated queries
// =====================

import type {
    ApiErrorLike,
    CameraId,
    IncidentId,
    IsoDateTimeString,
    PaginationMeta,
    PaginationRequest,
    SiteId,
} from '../../shared/api';

export enum IncidentSeverity {
    Info = 'info',
    Low = 'low',
    Medium = 'medium',
    High = 'high',
    Critical = 'critical',
}

export enum IncidentType {
    MissingHeadgear = 'missing_headgear',
    WrongHeadgear = 'wrong_headgear',
    MultiplePersons = 'multiple_persons',
    OccludedHead = 'occluded_head',
    Uncertain = 'uncertain',
    Other = 'other',
}

export enum IncidentDataQualityStatus {
    Ok = 'ok',
    MissingFrame = 'missing_frame',
    CorruptedMedia = 'corrupted_media',
    MissingContext = 'missing_context',
}

export enum IncidentSortField {
    CreatedAt = 'created_at',
    EventTime = 'event_time',
    Severity = 'severity',
    Confidence = 'confidence',
    Site = 'site',
    Camera = 'camera',
}

export enum SortDirection {
    Asc = 'asc',
    Desc = 'desc',
}

export interface IncidentSortOption {
    field: IncidentSortField;
    direction: SortDirection;
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface IncidentDto {
    id: IncidentId;
    event_id: string;

    created_at: IsoDateTimeString;
    updated_at: IsoDateTimeString;
    event_time: IsoDateTimeString;

    severity: IncidentSeverity;
    incident_type: IncidentType;

    confidence: number | null;

    site_id: SiteId;
    camera_id: CameraId;

    site_name?: string;
    camera_name?: string;

    bbox?: BoundingBox;
    data_quality_status?: IncidentDataQualityStatus;

    image_url: string;
    clip_url: string;

    tags?: string[];
    correlation_ids?: IncidentId[];
    extra?: Record<string, unknown>;
}

export type IncidentListQueryDto =
    & PaginationRequest
    & {
    from?: IsoDateTimeString;
    to?: IsoDateTimeString;

    /**
     * Backward-compatible single-value filters.
     * Keep them for endpoints that still expect one site/camera.
     */
    site_id?: SiteId;
    camera_id?: CameraId;

    /**
     * Multi-value filters for aggregated/report queries.
     * Useful when the user selects several sites/cameras at once.
     */
    site_ids?: SiteId[];
    camera_ids?: CameraId[];

    severity?: IncidentSeverity[];
    incident_type?: IncidentType[];

    search?: string;
    tags?: string[];

    min_confidence?: number;
    max_confidence?: number;

    sort?: IncidentSortOption[];
};

export interface IncidentListResponseDto {
    items: IncidentDto[];
    meta: PaginationMeta;
}

export interface IncidentListFilters {
    timeRange?: {
        from?: Date;
        to?: Date;
    };
    siteIds?: SiteId[];
    cameraIds?: CameraId[];
    severities?: IncidentSeverity[];
    types?: IncidentType[];
    minConfidence?: number;
    maxConfidence?: number;
    search?: string;
    tags?: string[];
}

export interface IncidentListQuery {
    filters: IncidentListFilters;
    sort: IncidentSortOption[];
    pagination: PaginationRequest;
}

export interface IncidentMetricBucket {
    key: string;
    count: number;
}

export interface IncidentMetricsDto {
    total_count: number;
    by_severity: IncidentMetricBucket[];
    by_type: IncidentMetricBucket[];
    by_site: IncidentMetricBucket[];
    by_camera: IncidentMetricBucket[];
}

export type IncidentApiError = ApiErrorLike & {
    status?: number;
    statusCode?: number;
    isCanceled?: boolean;
};

export type IncidentSeverityI18nKey = `incident.severity.${IncidentSeverity}`;
export type IncidentTypeI18nKey = `incident.type.${IncidentType}`;