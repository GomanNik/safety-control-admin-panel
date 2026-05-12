// =====================
// File: backend/src/shared/utils/pagination.ts
// Purpose:
// - Shared pagination meta helpers
// - Shape is aligned with frontend shared/api ApiListMeta contract
// =====================

interface PaginationMeta {
    total: number;
    page: number;
    pageSize: number;
}

interface BuildPaginationMetaInput {
    total: number;
    page: number;
    pageSize: number;
}

export function buildPaginationMeta(
    input: BuildPaginationMetaInput,
): PaginationMeta {
    return {
        total: Math.max(0, Math.trunc(input.total)),
        page: Math.max(1, Math.trunc(input.page)),
        pageSize: Math.max(1, Math.trunc(input.pageSize)),
    };
}