// =====================
// File: src/features/common/overview-dashboard/types.ts
// Purpose:
// - Public types for overview dashboard aggregates
// - Adapted to simplified camera contract:
//   status + statusReason + lastSeenAt
// =====================

import type { SiteId } from '../../../shared/api';

import type {
    Camera,
} from '../../../entities/camera';
import type {
    Incident,
} from '../../../entities/incident';
import type {
    Site,
} from '../../../entities/site';

import type { IncidentMetricsSummary } from '../../incident';

export interface SiteMetricsSummary {
    totalCount: number;
}

export interface OverviewDashboardScope {
    siteId?: SiteId;
}

export interface OverviewDashboardIncidentTimeRange {
    from: Date;
    to: Date;
}

export interface UseOverviewDashboardOptions {
    enabled?: boolean;
    scope?: OverviewDashboardScope;
    now?: Date;
    incidentWindowDays?: number;
    incidentTimeRange?: {
        from: Date;
        to: Date;
    };
    trendDays?: number;
    recentIncidentsLimit?: number;
    topSitesLimit?: number;
    topCamerasPerSite?: number;
}

export type OverviewDashboardItemState =
    | 'normal'
    | 'warning'
    | 'critical';

export type OverviewDashboardSiteMode =
    | 'active'
    | 'inactive';

export type OverviewDashboardSiteHealth =
    | 'normal'
    | 'warning'
    | 'critical';

export interface OverviewDashboardKpiSummary {
    totalSites: number;
    operationalSites: number;
    problematicSites: number;

    totalCameras: number;
    onlineCameras: number;
    attentionCameras: number;

    totalIncidents: number;
    criticalIncidents: number;
}

export interface OverviewDashboardSiteHealthItem {
    siteId: Site['id'];
    name: string;
    subtitle?: string;

    mode: OverviewDashboardSiteMode;
    health: OverviewDashboardSiteHealth;

    isOperational: boolean;
    isProblematic: boolean;
    state: OverviewDashboardItemState;

    totalCameras: number;
    onlineCameras: number;
    attentionCameras: number;

    recentIncidentCount: number;
}

export interface OverviewDashboardSitesHealthSummary {
    totalCount: number;
    problematicCount: number;
    normalCount: number;
    items: ReadonlyArray<OverviewDashboardSiteHealthItem>;
}

export interface OverviewDashboardCameraDigestItem {
    cameraId: Camera['id'];
    siteId: Camera['siteId'];

    name: string;

    status: Camera['status'];
    statusReason?: Camera['statusReason'];

    isStale: boolean;
    attention: boolean;

    lastSeenAt: Date | null;
    lastSeenAgeMs: number | null;

    recentIncidentCount: number;
}

export interface OverviewDashboardCameraSiteGroup {
    siteId: Site['id'];
    name: string;
    subtitle?: string;

    totalCameras: number;
    onlineCameras: number;
    attentionCameras: number;

    recentIncidentCount: number;

    cameras: ReadonlyArray<OverviewDashboardCameraDigestItem>;
}

export interface OverviewDashboardCamerasBySiteSummary {
    totalSites: number;
    totalCameras: number;
    onlineCameras: number;
    attentionCameras: number;
    groups: ReadonlyArray<OverviewDashboardCameraSiteGroup>;
}

export interface OverviewDashboardIncidentTrendPoint {
    key: string;
    startAt: Date;
    endAt: Date;
    count: number;
}

export interface OverviewDashboardIncidentsTrendSummary {
    timeRange: OverviewDashboardIncidentTimeRange;
    windowDays: number;
    totalCount: number;
    criticalCount: number;
    points: ReadonlyArray<OverviewDashboardIncidentTrendPoint>;
}

export interface OverviewDashboardMetricsSnapshot {
    siteSummary?: SiteMetricsSummary;
    incidentSummary?: IncidentMetricsSummary;
}

export interface OverviewDashboardRawData {
    sites: ReadonlyArray<Site>;
    cameras: ReadonlyArray<Camera>;
    incidents: ReadonlyArray<Incident>;
}

export interface OverviewDashboardState {
    isLoading: boolean;
    isFetching: boolean;
    isEmpty: boolean;
    hasPartialData: boolean;
    error: unknown | null;
}

export interface OverviewDashboardModel {
    scope: OverviewDashboardScope;
    state: OverviewDashboardState;

    kpis: OverviewDashboardKpiSummary;
    sitesHealth: OverviewDashboardSitesHealthSummary;
    camerasBySite: OverviewDashboardCamerasBySiteSummary;
    incidentsTrend: OverviewDashboardIncidentsTrendSummary;

    metrics: OverviewDashboardMetricsSnapshot;
    raw: OverviewDashboardRawData;

    refetchAll(): Promise<void>;
}