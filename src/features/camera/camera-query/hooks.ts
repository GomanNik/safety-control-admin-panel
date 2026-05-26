// =====================
// File: src/features/camera/camera-query/hooks.ts
// Purpose:
//   Unified camera list query source from CameraUIStore.
//   Aligned with simplified camera UI actions:
//   - setPagination
// =====================

import {
    useCallback,
    useMemo,
} from 'react';

import {
    selectCameraFilters,
    selectCameraPagination,
    useCameraUIStore,
    type CameraListQuery,
} from '../../../entities/camera';

import type {
    CameraListQuerySource,
    CameraQueryPaginationActions,
} from './types';

const normalizePositiveInt = (
    value: unknown,
    fallback: number,
): number => {
    const numericValue =
        typeof value === 'number'
            ? value
            : Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallback;
    }

    const normalizedValue = Math.floor(numericValue);

    return normalizedValue > 0
        ? normalizedValue
        : fallback;
};

export const useCameraListQuerySource = (): CameraListQuerySource => {
    const { state, actions } = useCameraUIStore();

    const filters = selectCameraFilters(state);
    const pagination = selectCameraPagination(state);

    const query = useMemo<CameraListQuery>(
        () => ({
            filters,
            pagination,
        }),
        [filters, pagination],
    );

    const setPage = useCallback<CameraQueryPaginationActions['setPage']>(
        (nextPage) => {
            const page = normalizePositiveInt(
                nextPage,
                pagination.page,
            );

            if (pagination.page === page) {
                return;
            }

            actions.setPagination({
                page,
            });
        },
        [actions, pagination.page],
    );

    const setPageSize = useCallback<
        CameraQueryPaginationActions['setPageSize']
    >(
        (nextPageSize) => {
            const pageSize = normalizePositiveInt(
                nextPageSize,
                pagination.pageSize,
            );

            if (
                pagination.pageSize === pageSize &&
                pagination.page === 1
            ) {
                return;
            }

            actions.setPagination({
                pageSize,
                page: 1,
            });
        },
        [actions, pagination.page, pagination.pageSize],
    );

    const resetPage = useCallback<
        CameraQueryPaginationActions['resetPage']
    >(
        () => {
            if (pagination.page === 1) {
                return;
            }

            actions.setPagination({
                page: 1,
            });
        },
        [actions, pagination.page],
    );

    const paginationActions = useMemo<CameraQueryPaginationActions>(
        () => ({
            setPage,
            setPageSize,
            resetPage,
        }),
        [setPage, setPageSize, resetPage],
    );

    return useMemo<CameraListQuerySource>(
        () => ({
            query,
            actions: paginationActions,
        }),
        [query, paginationActions],
    );
};

export const useCameraListQueryInput = (): CameraListQuery => {
    const { state } = useCameraUIStore();

    const filters = selectCameraFilters(state);
    const pagination = selectCameraPagination(state);

    return useMemo<CameraListQuery>(
        () => ({
            filters,
            pagination,
        }),
        [filters, pagination],
    );
};