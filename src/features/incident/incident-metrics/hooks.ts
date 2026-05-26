// =====================
// features/incident/incident-metrics/hooks.ts
// =====================

import { useMemo } from 'react';

import { useIncidentMetricsQuery } from '../../../entities/incident';
import { useIncidentFiltersQuery } from '../incident-filters';

import {
    selectIncidentMetricsSummary,
} from './selectors';
import type {
    IncidentMetricsFeatureInput,
    IncidentMetricsFeatureOptions,
    IncidentMetricsFeatureResult,
    IncidentMetricsSummary,
    IncidentMetricsSummaryInput,
    UseIncidentMetricsResult,
} from './types';

export function useIncidentMetricsQueryFeature(
    query: IncidentMetricsFeatureInput,
    options?: IncidentMetricsFeatureOptions,
): IncidentMetricsFeatureResult {
    return useIncidentMetricsQuery(query, options);
}

export function useIncidentMetricsFromFilters(
    options?: IncidentMetricsFeatureOptions,
): IncidentMetricsFeatureResult {
    const query = useIncidentFiltersQuery();

    return useIncidentMetricsQueryFeature(query, options);
}

export function useIncidentMetricsSummary(
    metrics: IncidentMetricsSummaryInput,
): IncidentMetricsSummary | undefined {
    return useMemo(() => {
        if (!metrics) {
            return undefined;
        }

        return selectIncidentMetricsSummary(metrics);
    }, [metrics]);
}

export function useIncidentMetrics(
    options?: IncidentMetricsFeatureOptions,
): UseIncidentMetricsResult {
    const query = useIncidentFiltersQuery();
    const metricsQuery = useIncidentMetricsQueryFeature(query, options);
    const summary = useIncidentMetricsSummary(metricsQuery.data);

    return useMemo<UseIncidentMetricsResult>(() => ({
        query,
        metricsQuery,
        summary,
    }), [query, metricsQuery, summary]);
}