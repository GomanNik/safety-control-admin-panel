// =====================
// features/camera/camera-query/types.ts
// =====================

import type {
    CameraListQuery,
} from "../../../entities/camera";

/**
 * Минимальный use-case API для управления пагинацией списка камер.
 */
export interface CameraQueryPaginationActions {
    setPage(nextPage: number): void;
    setPageSize(nextPageSize: number): void;
    resetPage(): void;
}

/**
 * Источник "запроса списка" для UI:
 * единый CameraListQuery (filters + pagination)
 * + минимальные actions для пагинации.
 */
export interface CameraListQuerySource {
    query: CameraListQuery;
    actions: CameraQueryPaginationActions;
}
