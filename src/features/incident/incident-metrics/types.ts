// =====================
// features/incident/incident-metrics/types.ts
// =====================

import {
    IncidentSeverity,
    IncidentType,
    useIncidentMetricsQuery,
} from '../../../entities/incident';
import type {
    IncidentListQuery,
    IncidentMetrics,
} from '../../../entities/incident';

export type IncidentMetricsFeatureInput = IncidentListQuery;

export type IncidentMetricsFeatureOptions =
    Parameters<typeof useIncidentMetricsQuery>[1];

export type IncidentMetricsFeatureResult =
    ReturnType<typeof useIncidentMetricsQuery>;

export type IncidentMetricsSeverityCounts = Record<IncidentSeverity, number>;
export type IncidentMetricsTypeCounts = Record<IncidentType, number>;

export interface IncidentMetricsSiteBucket {
    siteId: string;
    count: number;
}

export interface IncidentMetricsCameraBucket {
    cameraId: string;
    count: number;
}

export interface IncidentMetricsSummary {
    totalCount: number;

    severityCounts: IncidentMetricsSeverityCounts;
    typeCounts: IncidentMetricsTypeCounts;

    criticalCount: number;
    highSeverityCount: number;

    criticalSharePct: number;
    highSeveritySharePct: number;

    topSites: IncidentMetricsSiteBucket[];
    topCameras: IncidentMetricsCameraBucket[];
}

export type IncidentMetricsSummaryInput =
    IncidentMetrics | null | undefined;

export interface UseIncidentMetricsResult {
    query: IncidentMetricsFeatureInput;
    metricsQuery: IncidentMetricsFeatureResult;
    summary?: IncidentMetricsSummary;
}