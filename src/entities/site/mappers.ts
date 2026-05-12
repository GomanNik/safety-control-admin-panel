// =====================
// File: src/entities/site/mappers.ts
// Purpose:
// - Mappers between Site DTO contracts and frontend domain model
// =====================

import type {
    SiteAddressDto,
    SiteContactDto,
    SiteCreateDto,
    SiteDto,
    SiteListFilters,
    SiteListQuery,
    SiteListQueryDto,
    SiteMetricsDto,
    SitePatchDto,
} from './types';

import type {
    Site,
    SiteAddress,
    SiteContact,
    SiteCreate,
    SiteMetrics,
    SitePatch,
} from './model';

import type {
    IsoDateTimeString,
    SiteId,
} from '../../shared/api';

import { parseIsoDateOrInvalid } from '../../shared/date/parse';
import { getGlobalLogger } from '../../shared/logging';

const logger = getGlobalLogger()
    .child('entities')
    .child('site')
    .child('mappers');

const DATE_FALLBACK = new Date(0);

const safePreview = (
    value: unknown,
    maxLen: number = 64,
): string => {
    const normalized = String(value ?? '');
    return normalized.length <= maxLen
        ? normalized
        : `${normalized.slice(0, maxLen)}…`;
};

const isInvalidDate = (
    value: Date,
): boolean => Number.isNaN(value.getTime());

const normalizeOptionalText = (
    value: unknown,
): string | undefined => {
    if (value == null) {
        return undefined;
    }

    const normalized = String(value).trim();
    return normalized || undefined;
};

const normalizeNullableText = (
    value: unknown,
): string | null | undefined => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
};

function parseDateLike(
    value: unknown,
): Date {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'string') {
        return parseIsoDateOrInvalid(value as IsoDateTimeString);
    }

    if (typeof value === 'number') {
        return new Date(value < 1e12 ? value * 1000 : value);
    }

    return new Date(NaN);
}

function toValidDateOrFallback(args: {
    value: unknown;
    field: 'created_at' | 'updated_at';
    siteId?: SiteId;
    fallback?: Date;
}): Date {
    const parsed = parseDateLike(args.value);

    if (!isInvalidDate(parsed)) {
        return parsed;
    }

    const safeFallback = args.fallback && !isInvalidDate(args.fallback)
        ? args.fallback
        : DATE_FALLBACK;

    logger.warn('site mapper: invalid datetime, fallback applied', {
        siteId: safePreview(args.siteId),
        field: args.field,
        value: safePreview(args.value),
        fallbackIso: safeFallback.toISOString(),
    });

    return new Date(safeFallback.getTime());
}

function sortStrings<T extends string>(
    items: readonly T[],
): T[] {
    return [...items].sort((left, right) => left.localeCompare(right));
}

function normalizeStringArray(
    value: unknown,
): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const unique = Array.from(
        new Set(
            value
                .map((item) => String(item ?? '').trim())
                .filter(Boolean),
        ),
    );

    return unique.length > 0
        ? sortStrings(unique)
        : undefined;
}

function normalizeCount(
    value: unknown,
): number {
    const numeric = typeof value === 'number'
        ? value
        : Number(value);

    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Math.max(0, Math.trunc(numeric));
}

function mapSiteAddressDtoToModel(
    dto?: SiteAddressDto,
): SiteAddress | undefined {
    if (!dto) {
        return undefined;
    }

    return {
        country: dto.country,
        region: dto.region,
        city: dto.city,
        addressLine1: dto.address_line1,
        addressLine2: dto.address_line2,
        postalCode: dto.postal_code,
        latitude: dto.latitude,
        longitude: dto.longitude,
    };
}

function mapSiteContactDtoToModel(
    dto?: SiteContactDto,
): SiteContact | undefined {
    if (!dto) {
        return undefined;
    }

    return {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        position: dto.position,
    };
}

export function mapSiteAddressModelToDto(
    model?: SiteAddress | null,
): SiteAddressDto | null | undefined {
    if (model === undefined) {
        return undefined;
    }

    if (model === null) {
        return null;
    }

    return {
        country: model.country,
        region: model.region,
        city: model.city,
        address_line1: model.addressLine1,
        address_line2: model.addressLine2,
        postal_code: model.postalCode,
        latitude: model.latitude,
        longitude: model.longitude,
    };
}

export function mapSiteContactModelToDto(
    model?: SiteContact | null,
): SiteContactDto | null | undefined {
    if (model === undefined) {
        return undefined;
    }

    if (model === null) {
        return null;
    }

    return {
        name: model.name,
        email: model.email,
        phone: model.phone,
        position: model.position,
    };
}

export function mapSiteCreateModelToDto(
    model: SiteCreate,
): SiteCreateDto {
    return {
        name: String(model.name ?? '').trim(),
        code: normalizeNullableText(model.code),
        timezone: normalizeNullableText(model.timezone),
        region: normalizeNullableText(model.region),
        address: mapSiteAddressModelToDto(model.address),
        contact: mapSiteContactModelToDto(model.contact),
        tags: normalizeStringArray(model.tags),
        config: model.config,
    };
}

export function mapSitePatchModelToDto(
    patch: SitePatch,
): SitePatchDto {
    const dto: SitePatchDto = {};

    if (patch.name !== undefined) {
        dto.name = String(patch.name ?? '').trim();
    }

    if (patch.code !== undefined) {
        dto.code = typeof patch.code === 'string'
            ? (normalizeOptionalText(patch.code) ?? null)
            : patch.code;
    }

    if (patch.timezone !== undefined) {
        dto.timezone = typeof patch.timezone === 'string'
            ? (normalizeOptionalText(patch.timezone) ?? null)
            : patch.timezone;
    }

    if (patch.region !== undefined) {
        dto.region = typeof patch.region === 'string'
            ? (normalizeOptionalText(patch.region) ?? null)
            : patch.region;
    }

    if (patch.address !== undefined) {
        dto.address = mapSiteAddressModelToDto(patch.address);
    }

    if (patch.contact !== undefined) {
        dto.contact = mapSiteContactModelToDto(patch.contact);
    }

    if (patch.tags !== undefined) {
        dto.tags = normalizeStringArray(patch.tags);
    }

    if (patch.config !== undefined) {
        dto.config = patch.config;
    }

    return dto;
}

export function mapSiteDtoToModel(
    dto: SiteDto,
): Site {
    if (!dto?.id) {
        logger.warn('site mapper: missing id', {
            value: safePreview((dto as Partial<SiteDto>)?.id),
        });
    }

    const createdAt = toValidDateOrFallback({
        value: (dto as Partial<SiteDto>).created_at,
        field: 'created_at',
        siteId: dto?.id,
        fallback: DATE_FALLBACK,
    });

    const updatedAt = toValidDateOrFallback({
        value: (dto as Partial<SiteDto>).updated_at,
        field: 'updated_at',
        siteId: dto?.id,
        fallback: createdAt,
    });

    return {
        id: dto.id,
        name: dto.name,
        code: dto.code,
        timezone: dto.timezone,
        region: dto.region,
        address: mapSiteAddressDtoToModel(dto.address),
        contact: mapSiteContactDtoToModel(dto.contact),
        tags: normalizeStringArray(dto.tags) ?? [],
        createdAt,
        updatedAt,
        config: dto.config,
        extra: dto.extra,
    };
}

export function mapSiteMetricsDtoToModel(
    dto: SiteMetricsDto,
): SiteMetrics {
    return {
        totalCount: normalizeCount(dto.total_count),
        byRegion: (dto.by_region ?? []).map((bucket) => ({
            region: String(bucket.key ?? '').trim(),
            count: normalizeCount(bucket.count),
        })),
    };
}

function mapSiteFiltersToDto(
    filters: SiteListFilters,
): Partial<SiteListQueryDto> {
    const result: Partial<SiteListQueryDto> = {};

    if (filters.siteIds?.length) {
        result.site_ids = sortStrings(filters.siteIds);
    }

    if (filters.regions?.length) {
        result.region = sortStrings(filters.regions);
    }

    if (filters.timezones?.length) {
        result.timezone = sortStrings(filters.timezones);
    }

    if (filters.tags?.length) {
        result.tags = sortStrings(filters.tags);
    }

    if (filters.search && String(filters.search).trim().length > 0) {
        result.search = String(filters.search).trim();
    }

    return result;
}

export function mapSiteListQueryToDto(
    query: SiteListQuery,
): SiteListQueryDto {
    const filtersDto = mapSiteFiltersToDto(query.filters);

    return {
        page: query.pagination.page,
        pageSize: query.pagination.pageSize,
        ...filtersDto,
    };
}

export function mapSiteMetricsQueryToDto(
    query: SiteListQuery,
): SiteListQueryDto {
    const filtersDto = mapSiteFiltersToDto(query.filters);

    return {
        page: 1,
        pageSize: 1,
        ...filtersDto,
    };
}