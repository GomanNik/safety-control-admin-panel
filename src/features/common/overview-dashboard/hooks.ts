// =====================
// File: src/features/common/overview-dashboard/hooks.ts
// Purpose:
// - Aggregates sites, cameras, incidents, and metrics into one dashboard model
// - Keeps overview screen synchronized with simplified site contracts
// =====================

import {
    useCallback,
    useMemo,
} from 'react';

import { useCameraListQuery } from '../../../entities/camera';
import { useIncidentListQuery } from '../../../entities/incident';
import { useSiteListQuery } from '../../../entities/site';

import {
    useIncidentMetricsQueryFeature,
    useIncidentMetricsSummary,
} from '../../incident';

import {
    buildOverviewDashboardCameraListQuery,
    buildOverviewDashboardIncidentListQuery,
    buildOverviewDashboardSiteListQuery,
    DEFAULT_OVERVIEW_DASHBOARD_INCIDENT_WINDOW_DAYS,
    DEFAULT_OVERVIEW_DASHBOARD_TOP_SITES_LIMIT,
    mapOverviewDashboardCamerasBySiteSummary,
    mapOverviewDashboardIncidentsTrendSummary,
    mapOverviewDashboardKpiSummary,
    mapOverviewDashboardSitesHealthSummary,
    pickOverviewDashboardError,
} from './mappers';
import type {
    OverviewDashboardIncidentTimeRange,
    OverviewDashboardModel,
    OverviewDashboardScope,
    SiteMetricsSummary,
    UseOverviewDashboardOptions,
} from './types';

type QueryLike = {
    isLoading?: boolean;
    isPending?: boolean;
    isFetching?: boolean;
    error?: unknown;
};

const isQueryLoading = (
    query: QueryLike,
): boolean => {
    return Boolean(query.isLoading || query.isPending);
};

const isQueryFetching = (
    query: QueryLike,
): boolean => {
    return Boolean(query.isFetching);
};

export function useOverviewDashboard(
    options?: UseOverviewDashboardOptions,
): OverviewDashboardModel {
    const enabled = options?.enabled ?? true;

    const scope: OverviewDashboardScope = useMemo(
        () => ({
            siteId: options?.scope?.siteId,
        }),
        [options?.scope?.siteId],
    );

    const now = useMemo(
        () => options?.now ?? new Date(),
        [options?.now],
    );

    const incidentWindowDays = useMemo(
        () =>
            options?.incidentWindowDays ??
            DEFAULT_OVERVIEW_DASHBOARD_INCIDENT_WINDOW_DAYS,
        [options?.incidentWindowDays],
    );

    const topSitesLimit = useMemo(
        () =>
            options?.topSitesLimit ??
            DEFAULT_OVERVIEW_DASHBOARD_TOP_SITES_LIMIT,
        [options?.topSitesLimit],
    );

    const topCamerasPerSite = useMemo(
        () => options?.topCamerasPerSite,
        [options?.topCamerasPerSite],
    );

    const incidentTimeRange = useMemo<
        OverviewDashboardIncidentTimeRange | undefined
    >(
        () => {
            const from = options?.incidentTimeRange?.from;
            const to = options?.incidentTimeRange?.to;

            if (!from || !to) {
                return undefined;
            }

            return {
                from,
                to,
            };
        },
        [
            options?.incidentTimeRange?.from,
            options?.incidentTimeRange?.to,
        ],
    );

    const siteListQueryInput = useMemo(
        () => buildOverviewDashboardSiteListQuery(scope),
        [scope],
    );

    const cameraListQueryInput = useMemo(
        () => buildOverviewDashboardCameraListQuery(scope),
        [scope],
    );

    const incidentListQueryInput = useMemo(
        () =>
            buildOverviewDashboardIncidentListQuery(
                scope,
                now,
                incidentWindowDays,
                incidentTimeRange,
            ),
        [
            scope,
            now,
            incidentWindowDays,
            incidentTimeRange,
        ],
    );

    const siteListQuery = useSiteListQuery(siteListQueryInput, {
        enabled,
        keepPreviousData: true,
    });

    const cameraListQuery = useCameraListQuery(cameraListQueryInput, {
        enabled,
        keepPreviousData: true,
    });

    const incidentListQuery = useIncidentListQuery(incidentListQueryInput, {
        enabled,
        keepPreviousData: true,
    });

    const incidentMetricsQuery = useIncidentMetricsQueryFeature(
        incidentListQueryInput,
        {
            enabled,
            keepPreviousData: true,
        },
    );

    const sites = siteListQuery.data?.items ?? [];
    const cameras = cameraListQuery.data?.items ?? [];
    const incidents = incidentListQuery.data?.items ?? [];

    const siteMetricsSummary = useMemo<SiteMetricsSummary>(
        () => ({
            totalCount: sites.length,
        }),
        [sites.length],
    );

    const incidentMetricsSummary = useIncidentMetricsSummary(
        incidentMetricsQuery.data,
    ) ?? undefined;

    const sitesHealth = useMemo(
        () =>
            mapOverviewDashboardSitesHealthSummary({
                sites,
                cameras,
                incidents,
                topSitesLimit,
            }),
        [sites, cameras, incidents, topSitesLimit],
    );

    const camerasBySite = useMemo(
        () =>
            mapOverviewDashboardCamerasBySiteSummary({
                sites,
                cameras,
                incidents,
                topSitesLimit,
                topCamerasPerSite,
                now,
            }),
        [
            sites,
            cameras,
            incidents,
            topSitesLimit,
            topCamerasPerSite,
            now,
        ],
    );

    const incidentsTrendTimeRange = useMemo<OverviewDashboardIncidentTimeRange>(
        () => {
            const from = incidentListQueryInput.filters.timeRange?.from;
            const to = incidentListQueryInput.filters.timeRange?.to;

            if (from && to) {
                return {
                    from,
                    to,
                };
            }

            return {
                from: now,
                to: now,
            };
        },
        [
            incidentListQueryInput.filters.timeRange?.from,
            incidentListQueryInput.filters.timeRange?.to,
            now,
        ],
    );

    const incidentsTrend = useMemo(
        () =>
            mapOverviewDashboardIncidentsTrendSummary({
                incidents,
                incidentMetricsSummary,
                timeRange: incidentsTrendTimeRange,
            }),
        [
            incidents,
            incidentMetricsSummary,
            incidentsTrendTimeRange,
        ],
    );

    const kpis = useMemo(
        () =>
            mapOverviewDashboardKpiSummary({
                sites,
                cameras,
                siteMetricsSummary,
                incidentMetricsSummary,
                sitesHealthSummary: sitesHealth,
                incidentsTrendSummary: incidentsTrend,
            }),
        [
            sites,
            cameras,
            siteMetricsSummary,
            incidentMetricsSummary,
            sitesHealth,
            incidentsTrend,
        ],
    );

    const error = useMemo(
        () =>
            pickOverviewDashboardError(
                siteListQuery.error,
                cameraListQuery.error,
                incidentListQuery.error,
                incidentMetricsQuery.error,
            ),
        [
            siteListQuery.error,
            cameraListQuery.error,
            incidentListQuery.error,
            incidentMetricsQuery.error,
        ],
    );

    const isLoading = useMemo(() => {
        return (
            isQueryLoading(siteListQuery) ||
            isQueryLoading(cameraListQuery) ||
            isQueryLoading(incidentListQuery) ||
            isQueryLoading(incidentMetricsQuery)
        );
    }, [
        siteListQuery,
        cameraListQuery,
        incidentListQuery,
        incidentMetricsQuery,
    ]);

    const isFetching = useMemo(() => {
        return (
            isQueryFetching(siteListQuery) ||
            isQueryFetching(cameraListQuery) ||
            isQueryFetching(incidentListQuery) ||
            isQueryFetching(incidentMetricsQuery)
        );
    }, [
        siteListQuery,
        cameraListQuery,
        incidentListQuery,
        incidentMetricsQuery,
    ]);

    const hasAnyData = useMemo(() => {
        return (
            sites.length > 0 ||
            cameras.length > 0 ||
            incidents.length > 0 ||
            Boolean(incidentMetricsSummary?.totalCount)
        );
    }, [
        sites.length,
        cameras.length,
        incidents.length,
        incidentMetricsSummary?.totalCount,
    ]);

    const refetchAll = useCallback(async (): Promise<void> => {
        await Promise.allSettled([
            siteListQuery.refetch(),
            cameraListQuery.refetch(),
            incidentListQuery.refetch(),
            incidentMetricsQuery.refetch(),
        ]);
    }, [
        siteListQuery,
        cameraListQuery,
        incidentListQuery,
        incidentMetricsQuery,
    ]);

    return useMemo<OverviewDashboardModel>(() => ({
        scope,
        state: {
            isLoading,
            isFetching,
            isEmpty: !hasAnyData && !isLoading,
            hasPartialData: Boolean(error) && hasAnyData,
            error,
        },
        kpis,
        sitesHealth,
        camerasBySite,
        incidentsTrend,
        metrics: {
            siteSummary: siteMetricsSummary,
            incidentSummary: incidentMetricsSummary,
        },
        raw: {
            sites,
            cameras,
            incidents,
        },
        refetchAll,
    }), [
        scope,
        isLoading,
        isFetching,
        hasAnyData,
        error,
        kpis,
        sitesHealth,
        camerasBySite,
        incidentsTrend,
        siteMetricsSummary,
        incidentMetricsSummary,
        sites,
        cameras,
        incidents,
        refetchAll,
    ]);
}