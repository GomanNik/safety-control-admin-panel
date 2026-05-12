// =====================
// File: backend/src/modules/site/types.ts
// Purpose:
// - Public DTO contracts for backend site module
// - Internal persistence types for repository/service layers
// - Must stay aligned with current frontend Site entity contract
// =====================

export interface PaginationMetaDto {
    total: number;
    page: number;
    pageSize: number;
}

export interface SiteAddressDto {
    country: string;
    region?: string;
    city?: string;
    address_line1?: string;
    address_line2?: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
}

export interface SiteContactDto {
    name: string;
    email?: string;
    phone?: string;
    position?: string;
}

export interface SiteDto {
    id: string;
    name: string;
    code?: string;
    timezone?: string;
    region?: string;
    address?: SiteAddressDto;
    contact?: SiteContactDto;
    tags?: string[];
    created_at: string;
    updated_at: string;
    config?: Record<string, unknown>;
    extra?: Record<string, unknown>;
}

export interface SiteMetricBucketDto {
    key: string;
    count: number;
}

export interface SiteMetricsDto {
    total_count: number;
    by_region: SiteMetricBucketDto[];
}

export interface SiteListQueryDto {
    page: number;
    pageSize: number;
    site_ids?: string[];
    region?: string[];
    timezone?: string[];
    search?: string;
    tags?: string[];
}

export interface SiteListResponseDto {
    items: SiteDto[];
    meta: PaginationMetaDto;
}

export interface SiteCreateDto {
    name: string;
    code?: string | null;
    timezone?: string | null;
    region?: string | null;
    address?: SiteAddressDto | null;
    contact?: SiteContactDto | null;
    tags?: string[];
    config?: Record<string, unknown>;
}

export interface SitePatchDto {
    name?: string;
    code?: string | null;
    timezone?: string | null;
    region?: string | null;
    address?: SiteAddressDto | null;
    contact?: SiteContactDto | null;
    tags?: string[];
    config?: Record<string, unknown>;
}

export interface SiteRow {
    id: string;
    name: string;
    code: string | null;
    timezone: string | null;
    region: string | null;
    address: SiteAddressDto | null;
    contact: SiteContactDto | null;
    tags: string[] | null;
    created_at: Date | string;
    updated_at: Date | string;
    config: Record<string, unknown> | null;
    extra: Record<string, unknown> | null;
}

export interface SiteCreatePersistenceInput {
    id: string;
    name: string;
    code: string | null;
    timezone: string | null;
    region: string | null;
    address: SiteAddressDto | null;
    contact: SiteContactDto | null;
    tags: string[] | null;
    config: Record<string, unknown> | null;
    extra: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface SitePatchPersistenceInput {
    updated_at: string;
    name?: string;
    code?: string | null;
    timezone?: string | null;
    region?: string | null;
    address?: SiteAddressDto | null;
    contact?: SiteContactDto | null;
    tags?: string[] | null;
    config?: Record<string, unknown> | null;
    extra?: Record<string, unknown> | null;
}

export interface SiteListRepositoryResult {
    items: SiteRow[];
    total: number;
}