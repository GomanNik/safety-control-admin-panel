// =====================
// features/incident/incident-metrics/selectors.ts
// =====================

import {
    IncidentSeverity,
    IncidentType,
} from '../../../entities/incident';
import type { IncidentMetrics } from '../../../entities/incident';

import type {
    IncidentMetricsCameraBucket,
    IncidentMetricsSeverityCounts,
    IncidentMetricsSiteBucket,
    IncidentMetricsSummary,
    IncidentMetricsTypeCounts,
} from './types';

function toSafeNumber(value: unknown): number {
    const numeric = Number(value);

    return Number.isFinite(numeric)
        ? numeric
        : 0;
}

function safePercent(part: unknown, total: unknown): number {
    const safePart = toSafeNumber(part);
    const safeTotal = toSafeNumber(total);

    if (safeTotal <= 0) {
        return 0;
    }

    return (safePart / safeTotal) * 100;
}

function toTrimmedKey(value: unknown): string {
    return String(value ?? '').trim();
}

export function getIncidentMetricsSeverityCount(
    metrics: IncidentMetrics,
    severity: IncidentSeverity,
): number {
    const bucket = metrics.bySeverity
        .find((item) => item.key === severity);

    return toSafeNumber(bucket?.count);
}

export function getIncidentMetricsTypeCount(
    metrics: IncidentMetrics,
    type: IncidentType,
): number {
    const bucket = metrics.byType
        .find((item) => item.key === type);

    return toSafeNumber(bucket?.count);
}

export function selectIncidentMetricsSeverityCounts(
    metrics: IncidentMetrics,
): IncidentMetricsSeverityCounts {
    return {
        [IncidentSeverity.Info]: getIncidentMetricsSeverityCount(
            metrics,
            IncidentSeverity.Info,
        ),
        [IncidentSeverity.Low]: getIncidentMetricsSeverityCount(
            metrics,
            IncidentSeverity.Low,
        ),
        [IncidentSeverity.Medium]: getIncidentMetricsSeverityCount(
            metrics,
            IncidentSeverity.Medium,
        ),
        [IncidentSeverity.High]: getIncidentMetricsSeverityCount(
            metrics,
            IncidentSeverity.High,
        ),
        [IncidentSeverity.Critical]: getIncidentMetricsSeverityCount(
            metrics,
            IncidentSeverity.Critical,
        ),
    };
}

export function selectIncidentMetricsTypeCounts(
    metrics: IncidentMetrics,
): IncidentMetricsTypeCounts {
    return {
        [IncidentType.MissingHeadgear]: getIncidentMetricsTypeCount(
            metrics,
            IncidentType.MissingHeadgear,
        ),
        [IncidentType.WrongHeadgear]: getIncidentMetricsTypeCount(
            metrics,
            IncidentType.WrongHeadgear,
        ),
        [IncidentType.MultiplePersons]: getIncidentMetricsTypeCount(
            metrics,
            IncidentType.MultiplePersons,
        ),
        [IncidentType.OccludedHead]: getIncidentMetricsTypeCount(
            metrics,
            IncidentType.OccludedHead,
        ),
        [IncidentType.Uncertain]: getIncidentMetricsTypeCount(
            metrics,
            IncidentType.Uncertain,
        ),
        [IncidentType.Other]: getIncidentMetricsTypeCount(
            metrics,
            IncidentType.Other,
        ),
    };
}

export function selectTopIncidentMetricsSites(
    metrics: IncidentMetrics,
    limit = 5,
): IncidentMetricsSiteBucket[] {
    const safeLimit = Math.max(1, Math.floor(toSafeNumber(limit)));

    return metrics.bySite
        .map((item) => ({
            siteId: toTrimmedKey(item.key),
            count: toSafeNumber(item.count),
        }))
        .filter((item) => item.siteId && item.count > 0)
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }

            return left.siteId.localeCompare(right.siteId);
        })
        .slice(0, safeLimit);
}

export function selectTopIncidentMetricsCameras(
    metrics: IncidentMetrics,
    limit = 5,
): IncidentMetricsCameraBucket[] {
    const safeLimit = Math.max(1, Math.floor(toSafeNumber(limit)));

    return metrics.byCamera
        .map((item) => ({
            cameraId: toTrimmedKey(item.key),
            count: toSafeNumber(item.count),
        }))
        .filter((item) => item.cameraId && item.count > 0)
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }

            return left.cameraId.localeCompare(right.cameraId);
        })
        .slice(0, safeLimit);
}

export function selectIncidentMetricsSummary(
    metrics: IncidentMetrics,
): IncidentMetricsSummary {
    const totalCount = toSafeNumber(metrics.totalCount);
    const severityCounts = selectIncidentMetricsSeverityCounts(metrics);
    const typeCounts = selectIncidentMetricsTypeCounts(metrics);

    const criticalCount = severityCounts[IncidentSeverity.Critical];
    const highSeverityCount = (
        severityCounts[IncidentSeverity.High]
        + severityCounts[IncidentSeverity.Critical]
    );

    return {
        totalCount,

        severityCounts,
        typeCounts,

        criticalCount,
        highSeverityCount,

        criticalSharePct: safePercent(criticalCount, totalCount),
        highSeveritySharePct: safePercent(highSeverityCount, totalCount),

        topSites: selectTopIncidentMetricsSites(metrics, 5),
        topCameras: selectTopIncidentMetricsCameras(metrics, 5),
    };
}