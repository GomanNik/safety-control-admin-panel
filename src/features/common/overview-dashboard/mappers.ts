// =====================
// File: src/features/common/overview-dashboard/mappers.ts
// Purpose:
// - Mapping helpers for overview dashboard aggregates
// - Fully aligned with simplified camera contract:
//   status + statusReason + lastSeenAt
// =====================

import type {
    Camera,
    CameraListQuery,
} from '../../../entities/camera';
import {
    CameraStatus,
    getCameraLastSeenAgeMs,
    isCameraOnline,
    isCameraStale,
} from '../../../entities/camera';

import type {
    Incident,
    IncidentListQuery,
    IncidentSortOption,
} from '../../../entities/incident';
import {
    IncidentSeverity,
    IncidentSortField,
    SortDirection,
} from '../../../entities/incident';

import type {
    Site,
    SiteListQuery,
} from '../../../entities/site';

import type { IncidentMetricsSummary } from '../../incident';

import type {
    OverviewDashboardCameraDigestItem,
    OverviewDashboardCameraSiteGroup,
    OverviewDashboardCamerasBySiteSummary,
    OverviewDashboardIncidentTimeRange,
    OverviewDashboardIncidentTrendPoint,
    OverviewDashboardIncidentsTrendSummary,
    OverviewDashboardItemState,
    OverviewDashboardKpiSummary,
    OverviewDashboardScope,
    OverviewDashboardSiteHealth,
    OverviewDashboardSiteHealthItem,
    OverviewDashboardSiteMode,
    OverviewDashboardSitesHealthSummary,
    SiteMetricsSummary,
} from './types';

export const OVERVIEW_DASHBOARD_SITE_PAGE_SIZE = 100;
export const OVERVIEW_DASHBOARD_CAMERA_PAGE_SIZE = 250;
export const OVERVIEW_DASHBOARD_INCIDENT_PAGE_SIZE = 100;

export const DEFAULT_OVERVIEW_DASHBOARD_INCIDENT_WINDOW_DAYS = 30;
export const DEFAULT_OVERVIEW_DASHBOARD_TOP_SITES_LIMIT = 6;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toPositiveInteger = (
    value: number | undefined,
    fallback: number,
): number => {
    if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value <= 0
    ) {
        return fallback;
    }

    return Math.floor(value);
};

const withOptionalSiteIdsFilter = (
    scope?: OverviewDashboardScope,
): { siteIds?: Site['id'][] } => {
    if (!scope?.siteId) {
        return {};
    }

    return {
        siteIds: [scope.siteId],
    };
};

const withOptionalCameraSiteFilter = (
    scope?: OverviewDashboardScope,
): { siteId?: Camera['siteId'] } => {
    if (!scope?.siteId) {
        return {};
    }

    return {
        siteId: scope.siteId,
    };
};

const addDays = (
    value: Date,
    amount: number,
): Date => {
    const next = new Date(value);
    next.setDate(next.getDate() + amount);
    return next;
};

const startOfLocalDay = (
    value: Date,
): Date => {
    return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        0,
        0,
        0,
        0,
    );
};

const endOfLocalDay = (
    value: Date,
): Date => {
    return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        23,
        59,
        59,
        999,
    );
};

const getInclusiveDayCount = (
    from: Date,
    to: Date,
): number => {
    const diffMs =
        startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime();

    return Math.max(1, Math.floor(diffMs / ONE_DAY_MS) + 1);
};

const normalizeIncidentTimeRange = (
    now: Date,
    incidentWindowDays?: number,
    timeRange?: Partial<OverviewDashboardIncidentTimeRange>,
): OverviewDashboardIncidentTimeRange => {
    if (timeRange?.from && timeRange?.to) {
        const from = startOfLocalDay(timeRange.from);
        const to = endOfLocalDay(timeRange.to);

        if (from.getTime() <= to.getTime()) {
            return { from, to };
        }
    }

    const safeWindowDays = toPositiveInteger(
        incidentWindowDays,
        DEFAULT_OVERVIEW_DASHBOARD_INCIDENT_WINDOW_DAYS,
    );

    const from = startOfLocalDay(addDays(now, -(safeWindowDays - 1)));
    const to = endOfLocalDay(now);

    return { from, to };
};

const createIncidentSort = (): IncidentSortOption[] => {
    return [
        {
            field: IncidentSortField.EventTime,
            direction: SortDirection.Desc,
        },
    ];
};

const isCameraAttentionItem = (
    camera: Camera,
    nowMs?: number,
): boolean => {
    if (camera.status !== CameraStatus.Online) {
        return true;
    }

    return isCameraStale(camera, undefined, nowMs);
};

const compareDashboardState = (
    left: OverviewDashboardItemState,
    right: OverviewDashboardItemState,
): number => {
    const weight: Record<OverviewDashboardItemState, number> = {
        critical: 3,
        warning: 2,
        normal: 1,
    };

    return weight[right] - weight[left];
};

const compareText = (
    left: string,
    right: string,
): number => {
    return left.localeCompare(right, undefined, {
        sensitivity: 'base',
        numeric: true,
    });
};

const buildSiteLookup = (
    sites: ReadonlyArray<Site>,
): Map<Site['id'], Site> => {
    return new Map(sites.map((site) => [site.id, site]));
};

const buildCountMap = <TKey extends string>(
    values: ReadonlyArray<TKey>,
): Map<TKey, number> => {
    const result = new Map<TKey, number>();

    values.forEach((value) => {
        result.set(value, (result.get(value) ?? 0) + 1);
    });

    return result;
};

const getCameraDigestStatusRank = (
    status: Camera['status'],
): number => {
    switch (status) {
        case CameraStatus.Offline:
            return 4;

        case CameraStatus.Problem:
            return 3;

        case CameraStatus.Initializing:
            return 2;

        case CameraStatus.Unknown:
            return 1;

        case CameraStatus.Online:
        default:
            return 0;
    }
};

const formatOverviewSiteName = (
    site: Pick<Site, 'id' | 'name' | 'code'>,
): string => {
    const name = String(site.name ?? '').trim();
    const code = String(site.code ?? '').trim();

    if (code) {
        return `${code} · ${name || code}`;
    }

    if (name) {
        return name;
    }

    return String(site.id);
};

const formatOverviewSiteSubtitle = (
    site: Pick<Site, 'region'>,
): string | undefined => {
    const region = String(site.region ?? '').trim();

    return region || undefined;
};

const getOverviewSiteMode = (): OverviewDashboardSiteMode => {
    return 'active';
};

/**
 * Производное состояние площадки:
 * - critical: камеры есть, но ни одной online нет, при этом есть attention
 * - warning: есть attention-камеры или недавние инциденты
 * - normal: всё остальное
 */
const getOverviewSiteHealth = (params: {
    totalCameras: number;
    onlineCameras: number;
    attentionCameras: number;
    recentIncidentCount: number;
}): OverviewDashboardSiteHealth => {
    const {
        totalCameras,
        onlineCameras,
        attentionCameras,
        recentIncidentCount,
    } = params;

    if (
        totalCameras > 0 &&
        onlineCameras === 0 &&
        attentionCameras > 0
    ) {
        return 'critical';
    }

    if (
        attentionCameras > 0 ||
        recentIncidentCount > 0
    ) {
        return 'warning';
    }

    return 'normal';
};

const getOverviewSiteState = (params: {
    health: OverviewDashboardSiteHealth;
}): OverviewDashboardItemState => {
    const { health } = params;

    if (health === 'critical') {
        return 'critical';
    }

    if (health === 'warning') {
        return 'warning';
    }

    return 'normal';
};

const isOverviewSiteOperational = (params: {
    health: OverviewDashboardSiteHealth;
}): boolean => {
    return params.health === 'normal';
};

const isOverviewSiteProblematic = (params: {
    health: OverviewDashboardSiteHealth;
    attentionCameras: number;
    recentIncidentCount: number;
}): boolean => {
    return (
        params.health !== 'normal' ||
        params.attentionCameras > 0 ||
        params.recentIncidentCount > 0
    );
};

export function buildOverviewDashboardSiteListQuery(
    scope?: OverviewDashboardScope,
): SiteListQuery {
    return {
        filters: {
            ...withOptionalSiteIdsFilter(scope),
        },
        pagination: {
            page: 1,
            pageSize: OVERVIEW_DASHBOARD_SITE_PAGE_SIZE,
        },
    };
}

export function buildOverviewDashboardCameraListQuery(
    scope?: OverviewDashboardScope,
): CameraListQuery {
    return {
        filters: {
            ...withOptionalCameraSiteFilter(scope),
        },
        pagination: {
            page: 1,
            pageSize: OVERVIEW_DASHBOARD_CAMERA_PAGE_SIZE,
        },
    };
}

export function buildOverviewDashboardIncidentListQuery(
    scope: OverviewDashboardScope | undefined,
    now: Date,
    incidentWindowDays?: number,
    incidentTimeRange?: {
        from: Date;
        to: Date;
    },
): IncidentListQuery {
    const normalizedTimeRange = normalizeIncidentTimeRange(
        now,
        incidentWindowDays,
        incidentTimeRange,
    );

    return {
        filters: {
            ...withOptionalSiteIdsFilter(scope),
            timeRange: normalizedTimeRange,
        },
        sort: createIncidentSort(),
        pagination: {
            page: 1,
            pageSize: OVERVIEW_DASHBOARD_INCIDENT_PAGE_SIZE,
        },
    };
}

export function mapOverviewDashboardSitesHealthSummary(params: {
    sites: ReadonlyArray<Site>;
    cameras: ReadonlyArray<Camera>;
    incidents: ReadonlyArray<Incident>;
    topSitesLimit?: number;
}): OverviewDashboardSitesHealthSummary {
    const {
        sites,
        cameras,
        incidents,
        topSitesLimit,
    } = params;

    const safeTopSitesLimit = toPositiveInteger(
        topSitesLimit,
        DEFAULT_OVERVIEW_DASHBOARD_TOP_SITES_LIMIT,
    );

    const cameraTotalsBySite = new Map<Site['id'], number>();
    const onlineCamerasBySite = new Map<Site['id'], number>();
    const attentionCamerasBySite = new Map<Site['id'], number>();

    cameras.forEach((camera) => {
        cameraTotalsBySite.set(
            camera.siteId,
            (cameraTotalsBySite.get(camera.siteId) ?? 0) + 1,
        );

        if (isCameraOnline(camera)) {
            onlineCamerasBySite.set(
                camera.siteId,
                (onlineCamerasBySite.get(camera.siteId) ?? 0) + 1,
            );
        }

        if (isCameraAttentionItem(camera)) {
            attentionCamerasBySite.set(
                camera.siteId,
                (attentionCamerasBySite.get(camera.siteId) ?? 0) + 1,
            );
        }
    });

    const recentIncidentsBySite = buildCountMap(
        incidents.map((incident) => incident.location.siteId),
    );

    const allItems = sites
        .map<OverviewDashboardSiteHealthItem>((site) => {
            const totalCameras = cameraTotalsBySite.get(site.id) ?? 0;
            const onlineCameras = onlineCamerasBySite.get(site.id) ?? 0;
            const attentionCameras = attentionCamerasBySite.get(site.id) ?? 0;
            const recentIncidentCount =
                recentIncidentsBySite.get(site.id) ?? 0;

            const mode = getOverviewSiteMode();
            const health = getOverviewSiteHealth({
                totalCameras,
                onlineCameras,
                attentionCameras,
                recentIncidentCount,
            });
            const state = getOverviewSiteState({
                health,
            });

            return {
                siteId: site.id,
                name: formatOverviewSiteName(site),
                subtitle: formatOverviewSiteSubtitle(site),
                mode,
                health,
                isOperational: isOverviewSiteOperational({
                    health,
                }),
                isProblematic: isOverviewSiteProblematic({
                    health,
                    attentionCameras,
                    recentIncidentCount,
                }),
                state,
                totalCameras,
                onlineCameras,
                attentionCameras,
                recentIncidentCount,
            };
        })
        .sort((left, right) => {
            const stateCompare = compareDashboardState(
                left.state,
                right.state,
            );

            if (stateCompare !== 0) {
                return stateCompare;
            }

            if (right.attentionCameras !== left.attentionCameras) {
                return right.attentionCameras - left.attentionCameras;
            }

            if (right.recentIncidentCount !== left.recentIncidentCount) {
                return right.recentIncidentCount - left.recentIncidentCount;
            }

            return compareText(left.name, right.name);
        });

    const problematicCount = allItems.filter(
        (item) => item.state !== 'normal',
    ).length;

    return {
        totalCount: allItems.length,
        problematicCount,
        normalCount: allItems.length - problematicCount,
        items: allItems.slice(0, safeTopSitesLimit),
    };
}

export function mapOverviewDashboardCamerasBySiteSummary(params: {
    sites: ReadonlyArray<Site>;
    cameras: ReadonlyArray<Camera>;
    incidents: ReadonlyArray<Incident>;
    topSitesLimit?: number;
    topCamerasPerSite?: number;
    now?: Date;
}): OverviewDashboardCamerasBySiteSummary {
    const {
        sites,
        cameras,
        incidents,
        topSitesLimit,
        topCamerasPerSite,
        now,
    } = params;

    const safeTopSitesLimit = toPositiveInteger(
        topSitesLimit,
        DEFAULT_OVERVIEW_DASHBOARD_TOP_SITES_LIMIT,
    );
    const safeTopCamerasPerSite = toPositiveInteger(
        topCamerasPerSite,
        Number.MAX_SAFE_INTEGER,
    );
    const currentNow = now?.getTime();

    const siteLookup = buildSiteLookup(sites);

    const incidentCountByCamera = buildCountMap(
        incidents.map((incident) => incident.location.cameraId),
    );

    const groupsMap = new Map<
        Camera['siteId'],
        {
            siteId: Camera['siteId'];
            name: string;
            subtitle?: string;
            totalCameras: number;
            onlineCameras: number;
            attentionCameras: number;
            recentIncidentCount: number;
            cameras: OverviewDashboardCameraDigestItem[];
        }
    >();

    cameras.forEach((camera) => {
        const site = siteLookup.get(camera.siteId);

        const group = groupsMap.get(camera.siteId) ?? {
            siteId: camera.siteId,
            name: site
                ? formatOverviewSiteName(site)
                : String(camera.siteId),
            subtitle: site
                ? formatOverviewSiteSubtitle(site)
                : undefined,
            totalCameras: 0,
            onlineCameras: 0,
            attentionCameras: 0,
            recentIncidentCount: 0,
            cameras: [],
        };

        const recentIncidentCount =
            incidentCountByCamera.get(camera.id) ?? 0;
        const attention = isCameraAttentionItem(camera, currentNow);

        const item: OverviewDashboardCameraDigestItem = {
            cameraId: camera.id,
            siteId: camera.siteId,
            name: camera.name,
            status: camera.status,
            statusReason: camera.statusReason ?? undefined,
            isStale: isCameraStale(camera, undefined, currentNow),
            attention,
            lastSeenAt: camera.lastSeenAt,
            lastSeenAgeMs: getCameraLastSeenAgeMs(camera, currentNow),
            recentIncidentCount,
        };

        group.totalCameras += 1;
        group.recentIncidentCount += recentIncidentCount;

        if (isCameraOnline(camera)) {
            group.onlineCameras += 1;
        }

        if (attention) {
            group.attentionCameras += 1;
        }

        group.cameras.push(item);

        groupsMap.set(camera.siteId, group);
    });

    const groups: OverviewDashboardCameraSiteGroup[] = Array.from(
        groupsMap.values(),
    )
        .map((group) => ({
            ...group,
            cameras: [...group.cameras]
                .sort((left, right) => {
                    if (left.attention !== right.attention) {
                        return Number(right.attention) - Number(left.attention);
                    }

                    if (
                        right.recentIncidentCount !==
                        left.recentIncidentCount
                    ) {
                        return (
                            right.recentIncidentCount -
                            left.recentIncidentCount
                        );
                    }

                    const statusCompare =
                        getCameraDigestStatusRank(right.status) -
                        getCameraDigestStatusRank(left.status);

                    if (statusCompare !== 0) {
                        return statusCompare;
                    }

                    if (left.isStale !== right.isStale) {
                        return Number(right.isStale) - Number(left.isStale);
                    }

                    return compareText(left.name, right.name);
                })
                .slice(0, safeTopCamerasPerSite),
        }))
        .sort((left, right) => {
            if (right.attentionCameras !== left.attentionCameras) {
                return right.attentionCameras - left.attentionCameras;
            }

            if (right.recentIncidentCount !== left.recentIncidentCount) {
                return right.recentIncidentCount - left.recentIncidentCount;
            }

            return compareText(left.name, right.name);
        })
        .slice(0, safeTopSitesLimit);

    return {
        totalSites: groupsMap.size,
        totalCameras: cameras.length,
        onlineCameras: cameras.filter(isCameraOnline).length,
        attentionCameras: cameras.filter((camera) => isCameraAttentionItem(camera)).length,
        groups,
    };
}

export function mapOverviewDashboardIncidentsTrendSummary(params: {
    incidents: ReadonlyArray<Incident>;
    incidentMetricsSummary?: IncidentMetricsSummary;
    timeRange: OverviewDashboardIncidentTimeRange;
}): OverviewDashboardIncidentsTrendSummary {
    const {
        incidents,
        incidentMetricsSummary,
        timeRange,
    } = params;

    const from = startOfLocalDay(timeRange.from);
    const to = endOfLocalDay(timeRange.to);
    const windowDays = getInclusiveDayCount(from, to);

    const points: OverviewDashboardIncidentTrendPoint[] = Array.from(
        { length: windowDays },
        (_, index) => {
            const day = addDays(from, index);
            const startAt = startOfLocalDay(day);
            const endAt = endOfLocalDay(day);

            return {
                key: startAt.toISOString(),
                startAt,
                endAt,
                count: 0,
            };
        },
    );

    const pointIndexByKey = new Map<string, number>(
        points.map((point, index) => [point.key, index]),
    );

    incidents.forEach((incident) => {
        const incidentDay = startOfLocalDay(incident.eventTime);
        const key = incidentDay.toISOString();
        const pointIndex = pointIndexByKey.get(key);

        if (pointIndex == null) {
            return;
        }

        points[pointIndex].count += 1;
    });

    const criticalCount =
        incidentMetricsSummary?.criticalCount ??
        incidents.filter(
            (incident) =>
                incident.severity === IncidentSeverity.Critical,
        ).length;

    return {
        timeRange: { from, to },
        windowDays,
        totalCount:
            incidentMetricsSummary?.totalCount ?? incidents.length,
        criticalCount,
        points,
    };
}

export function mapOverviewDashboardKpiSummary(params: {
    sites: ReadonlyArray<Site>;
    cameras: ReadonlyArray<Camera>;
    siteMetricsSummary?: SiteMetricsSummary;
    incidentMetricsSummary?: IncidentMetricsSummary;
    sitesHealthSummary: OverviewDashboardSitesHealthSummary;
    incidentsTrendSummary: OverviewDashboardIncidentsTrendSummary;
}): OverviewDashboardKpiSummary {
    const {
        sites,
        cameras,
        siteMetricsSummary,
        incidentMetricsSummary,
        sitesHealthSummary,
        incidentsTrendSummary,
    } = params;

    const totalSites =
        siteMetricsSummary?.totalCount ?? sites.length;

    return {
        totalSites,
        operationalSites: Math.max(
            0,
            sitesHealthSummary.totalCount - sitesHealthSummary.problematicCount,
        ),
        problematicSites: sitesHealthSummary.problematicCount,

        totalCameras: cameras.length,
        onlineCameras: cameras.filter(isCameraOnline).length,
        attentionCameras: cameras.filter((camera) => isCameraAttentionItem(camera)).length,

        totalIncidents:
            incidentMetricsSummary?.totalCount ??
            incidentsTrendSummary.totalCount,
        criticalIncidents:
            incidentMetricsSummary?.criticalCount ??
            incidentsTrendSummary.criticalCount,
    };
}

export function pickOverviewDashboardError(
    ...errors: Array<unknown>
): unknown | null {
    for (const error of errors) {
        if (error != null) {
            return error;
        }
    }

    return null;
}