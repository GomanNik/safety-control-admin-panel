// =====================
// File: src/features/camera/camera-table/hooks.ts
// Purpose:
//   Табличная модель камер под новый контракт.
//   Без selection и без visible columns.
// =====================

import {
    useCallback,
    useMemo,
} from 'react';

import { useI18nContext } from '../../../shared/i18n';
import type {
    Camera,
    CameraListQuery,
} from '../../../entities/camera';
import { useCameraListQuery } from '../../../entities/camera';
import type { SiteListQuery } from '../../../entities/site';
import {
    formatSiteDisplayName,
    useSiteListQuery,
} from '../../../entities/site';

import { useCameraListQueryInput } from '../camera-query';
import { mapCameraToTableRow } from './mappers';
import type {
    CameraTableModel,
    CameraTableRowVM,
} from './types';

export interface UseCameraTableOptions {
    query?: CameraListQuery;
    keepPreviousData?: boolean;
}

const uniq = <T,>(
    items: readonly T[],
): T[] => {
    const seen = new Set<T>();
    const output: T[] = [];

    for (const item of items) {
        if (seen.has(item)) {
            continue;
        }

        seen.add(item);
        output.push(item);
    }

    return output;
};

export const useCameraTableModel = (
    options?: UseCameraTableOptions,
): CameraTableModel => {
    const { t, locale } = useI18nContext();

    const queryFromFeature = useCameraListQueryInput();
    const query = options?.query ?? queryFromFeature;
    const keepPreviousData = options?.keepPreviousData ?? true;

    const list = useCameraListQuery(query, {
        keepPreviousData,
    });

    const pageItems = list.data?.items ?? [];

    const pageSiteIds = useMemo<Camera['siteId'][]>(() => {
        return uniq(pageItems.map((camera) => camera.siteId)).sort(
            (left, right) => String(left).localeCompare(String(right)),
        );
    }, [pageItems]);

    const pageSitesQuery = useMemo<SiteListQuery>(() => ({
        filters: pageSiteIds.length > 0
            ? { siteIds: pageSiteIds }
            : {},
        pagination: {
            page: 1,
            pageSize: Math.max(pageSiteIds.length, 1),
        },
    }), [pageSiteIds]);

    const sites = useSiteListQuery(
        pageSitesQuery,
        {
            enabled: pageSiteIds.length > 0,
            keepPreviousData,
        },
    );

    const siteLabelById = useMemo(() => {
        const map = new Map<Camera['siteId'], string>();

        for (const site of sites.data?.items ?? []) {
            map.set(
                site.id,
                formatSiteDisplayName(site, {
                    t,
                    locale,
                }),
            );
        }

        return map;
    }, [locale, sites.data?.items, t]);

    const rows = useMemo<CameraTableRowVM[]>(() => {
        return pageItems.map((camera) => mapCameraToTableRow(
            camera,
            {
                t,
                locale,
                siteLabel: siteLabelById.get(camera.siteId),
            },
        ));
    }, [
        pageItems,
        locale,
        siteLabelById,
        t,
    ]);

    const refresh = useCallback(async (): Promise<void> => {
        await Promise.all([
            list.refetch(),
            pageSiteIds.length > 0
                ? sites.refetch()
                : Promise.resolve(),
        ]);
    }, [list, pageSiteIds.length, sites]);

    const loading = Boolean(
        !list.data &&
        (list.isLoading || list.isFetching),
    );

    const error = list.error ?? sites.error ?? null;

    return useMemo<CameraTableModel>(
        () => ({
            rows,
            total: list.data?.total ?? 0,
            loading,
            error,
            refresh,
        }),
        [
            rows,
            list.data?.total,
            loading,
            error,
            refresh,
        ],
    );
};