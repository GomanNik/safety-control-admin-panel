// =====================
// File: src/entities/site/types.ts
// Purpose:
// - DTO and query contracts for Site entity
// - Bulk actions and inactive-state filters are intentionally removed
// =====================

import type {
    ApiErrorLike,
    IsoDateTimeString,
    PaginationMeta,
    PaginationRequest,
    SiteId,
} from '../../shared/api';

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
    id: SiteId;
    name: string;
    code?: string;

    timezone?: string;
    region?: string;
    address?: SiteAddressDto;
    contact?: SiteContactDto;
    tags?: string[];
    created_at: IsoDateTimeString;
    updated_at: IsoDateTimeString;
    config?: Record<string, unknown>;
    extra?: Record<string, unknown>;
}

export interface SiteMetricBucket {
    key: string;
    count: number;
}

export interface SiteMetricsDto {
    total_count: number;
    by_region: SiteMetricBucket[];
}

export interface SiteListQueryDto extends PaginationRequest {
    site_ids?: SiteId[];
    region?: string[];
    timezone?: string[];
    search?: string;
    tags?: string[];
}

export interface SiteListResponseDto {
    items: SiteDto[];
    meta: PaginationMeta;
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

export interface SiteListFilters {
    siteIds?: SiteId[];
    regions?: string[];
    timezones?: string[];
    search?: string;
    tags?: string[];
}

export interface SiteListQuery {
    filters: SiteListFilters;
    pagination: PaginationRequest;
}

export type SiteApiError = ApiErrorLike;