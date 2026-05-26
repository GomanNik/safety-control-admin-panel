// =====================
// File: backend/src/modules/site/service.ts
// Purpose:
// - Business logic for site module
// - Normalizes payloads, enforces invariants, and maps rows to DTOs
// - Reuses backend shared errors/utils instead of duplicating low-level logic
// - Maps possible DB unique violations on site code back to stable API conflict
// =====================

import { randomUUID } from 'node:crypto';

import {
    conflict,
    notFound,
} from '../../shared/errors';
import {
    buildPaginationMeta,
    hasOwnKey,
    normalizeNullableText,
    normalizeOptionalText,
    normalizeRecord,
    normalizeStringArray,
} from '../../shared/utils';

import {
    countSites,
    deleteSiteById,
    findSiteByCode,
    findSiteById,
    findSiteList,
    getSiteMetricsByRegion,
    insertSite,
    updateSiteById,
} from './repository';

import type {
    SiteAddressDto,
    SiteContactDto,
    SiteCreateDto,
    SiteCreatePersistenceInput,
    SiteDto,
    SiteListQueryDto,
    SiteListResponseDto,
    SiteMetricsDto,
    SitePatchDto,
    SitePatchPersistenceInput,
    SiteRow,
} from './types';

const INVALID_DATE_FALLBACK = new Date(0).toISOString();

interface PgErrorLike {
    code?: unknown;
    constraint?: unknown;
    detail?: unknown;
    table?: unknown;
}

const SITE_CODE_CONFLICT_CODE = 'SITE_CODE_CONFLICT';

const SITE_CODE_CONFLICT_MESSAGE = (
    code: string,
): string => `Site code "${code}" is already used`;

const toIsoDateTimeString = (
    value: Date | string,
): string => {
    const parsed = value instanceof Date
        ? value
        : new Date(String(value));

    return Number.isNaN(parsed.getTime())
        ? INVALID_DATE_FALLBACK
        : parsed.toISOString();
};

function normalizeSiteAddress(
    value: SiteAddressDto | null | undefined,
): SiteAddressDto | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const country = normalizeOptionalText(value.country);

    if (!country) {
        return null;
    }

    const normalized: SiteAddressDto = {
        country,
    };

    const region = normalizeOptionalText(value.region);
    const city = normalizeOptionalText(value.city);
    const addressLine1 = normalizeOptionalText(value.address_line1);
    const addressLine2 = normalizeOptionalText(value.address_line2);
    const postalCode = normalizeOptionalText(value.postal_code);

    if (region) {
        normalized.region = region;
    }

    if (city) {
        normalized.city = city;
    }

    if (addressLine1) {
        normalized.address_line1 = addressLine1;
    }

    if (addressLine2) {
        normalized.address_line2 = addressLine2;
    }

    if (postalCode) {
        normalized.postal_code = postalCode;
    }

    if (typeof value.latitude === 'number' && Number.isFinite(value.latitude)) {
        normalized.latitude = value.latitude;
    }

    if (typeof value.longitude === 'number' && Number.isFinite(value.longitude)) {
        normalized.longitude = value.longitude;
    }

    return normalized;
}

function normalizeSiteContact(
    value: SiteContactDto | null | undefined,
): SiteContactDto | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const name = normalizeOptionalText(value.name);

    if (!name) {
        return null;
    }

    const normalized: SiteContactDto = {
        name,
    };

    const email = normalizeOptionalText(value.email);
    const phone = normalizeOptionalText(value.phone);
    const position = normalizeOptionalText(value.position);

    if (email) {
        normalized.email = email;
    }

    if (phone) {
        normalized.phone = phone;
    }

    if (position) {
        normalized.position = position;
    }

    return normalized;
}

function mapSiteRowToDto(
    row: SiteRow,
): SiteDto {
    return {
        id: row.id,
        name: row.name,
        code: row.code ?? undefined,
        timezone: row.timezone ?? undefined,
        region: row.region ?? undefined,
        address: row.address ?? undefined,
        contact: row.contact ?? undefined,
        tags: row.tags ?? undefined,
        created_at: toIsoDateTimeString(row.created_at),
        updated_at: toIsoDateTimeString(row.updated_at),
        config: row.config ?? undefined,
        extra: row.extra ?? undefined,
    };
}

function normalizeCreateInput(
    payload: SiteCreateDto,
): SiteCreatePersistenceInput {
    const nowIso = new Date().toISOString();

    return {
        id: randomUUID(),
        name: String(payload.name).trim(),
        code: normalizeNullableText(payload.code) ?? null,
        timezone: normalizeNullableText(payload.timezone) ?? null,
        region: normalizeNullableText(payload.region) ?? null,
        address: normalizeSiteAddress(payload.address) ?? null,
        contact: normalizeSiteContact(payload.contact) ?? null,
        tags: normalizeStringArray(payload.tags) ?? null,
        config: normalizeRecord(payload.config) ?? null,
        extra: null,
        created_at: nowIso,
        updated_at: nowIso,
    };
}

function normalizePatchInput(
    payload: SitePatchDto,
): SitePatchPersistenceInput {
    const patch: SitePatchPersistenceInput = {
        updated_at: new Date().toISOString(),
    };

    if (hasOwnKey(payload, 'name') && payload.name !== undefined) {
        patch.name = String(payload.name).trim();
    }

    if (hasOwnKey(payload, 'code')) {
        patch.code = normalizeNullableText(payload.code) ?? null;
    }

    if (hasOwnKey(payload, 'timezone')) {
        patch.timezone = normalizeNullableText(payload.timezone) ?? null;
    }

    if (hasOwnKey(payload, 'region')) {
        patch.region = normalizeNullableText(payload.region) ?? null;
    }

    if (hasOwnKey(payload, 'address')) {
        patch.address = normalizeSiteAddress(payload.address) ?? null;
    }

    if (hasOwnKey(payload, 'contact')) {
        patch.contact = normalizeSiteContact(payload.contact) ?? null;
    }

    if (hasOwnKey(payload, 'tags')) {
        patch.tags = normalizeStringArray(payload.tags) ?? [];
    }

    if (hasOwnKey(payload, 'config')) {
        patch.config = normalizeRecord(payload.config) ?? null;
    }

    return patch;
}

function assertSiteExists(
    row: SiteRow | null,
    id: string,
): SiteRow {
    if (row) {
        return row;
    }

    throw notFound(
        'SITE_NOT_FOUND',
        `Site "${id}" not found`,
    );
}

function isSiteCodeUniqueViolation(
    error: unknown,
): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const pgError = error as PgErrorLike;

    if (pgError.code !== '23505') {
        return false;
    }

    const constraint = String(pgError.constraint ?? '')
        .trim()
        .toLowerCase();

    const detail = String(pgError.detail ?? '')
        .trim()
        .toLowerCase();

    const table = String(pgError.table ?? '')
        .trim()
        .toLowerCase();

    const mentionsSites =
        table === '' ||
        table === 'sites' ||
        constraint.includes('site');

    const mentionsCode =
        constraint.includes('code') ||
        detail.includes('(code)') ||
        detail.includes(' code ') ||
        detail.includes('code)=') ||
        detail.includes('key (code)');

    return mentionsSites && mentionsCode;
}

function rethrowSiteCodeConflict(
    error: unknown,
    code: string | null,
): never {
    if (code && isSiteCodeUniqueViolation(error)) {
        throw conflict(
            SITE_CODE_CONFLICT_CODE,
            SITE_CODE_CONFLICT_MESSAGE(code),
        );
    }

    throw error;
}

async function assertCodeIsUnique(
    code: string | null,
    excludeId?: string,
): Promise<void> {
    if (!code) {
        return;
    }

    const existing = await findSiteByCode(code, excludeId);

    if (!existing) {
        return;
    }

    throw conflict(
        SITE_CODE_CONFLICT_CODE,
        SITE_CODE_CONFLICT_MESSAGE(code),
    );
}

export async function getSiteById(
    id: string,
): Promise<SiteDto> {
    const row = await findSiteById(id);
    return mapSiteRowToDto(assertSiteExists(row, id));
}

export async function getSiteList(
    query: SiteListQueryDto,
): Promise<SiteListResponseDto> {
    const result = await findSiteList(query);

    return {
        items: result.items.map(mapSiteRowToDto),
        meta: buildPaginationMeta({
            total: result.total,
            page: query.page,
            pageSize: query.pageSize,
        }),
    };
}

export async function createSite(
    payload: SiteCreateDto,
): Promise<SiteDto> {
    const input = normalizeCreateInput(payload);

    await assertCodeIsUnique(input.code);

    try {
        const created = await insertSite(input);
        return mapSiteRowToDto(created);
    } catch (error) {
        rethrowSiteCodeConflict(error, input.code);
    }
}

export async function patchSite(
    id: string,
    payload: SitePatchDto,
): Promise<SiteDto> {
    const existing = assertSiteExists(await findSiteById(id), id);
    const patch = normalizePatchInput(payload);

    if (hasOwnKey(patch, 'code')) {
        await assertCodeIsUnique(patch.code ?? null, id);
    }

    const hasEffectiveChanges = Object.keys(patch).some(
        (key) => key !== 'updated_at',
    );

    if (!hasEffectiveChanges) {
        return mapSiteRowToDto(existing);
    }

    try {
        const updated = await updateSiteById(id, patch);
        return mapSiteRowToDto(assertSiteExists(updated, id));
    } catch (error) {
        rethrowSiteCodeConflict(error, patch.code ?? null);
    }
}

export async function deleteSite(
    id: string,
): Promise<void> {
    const deleted = await deleteSiteById(id);

    if (!deleted) {
        throw notFound(
            'SITE_NOT_FOUND',
            `Site "${id}" not found`,
        );
    }
}

export async function getSiteMetrics(
    query: SiteListQueryDto,
): Promise<SiteMetricsDto> {
    const [totalCount, byRegion] = await Promise.all([
        countSites(query),
        getSiteMetricsByRegion(query),
    ]);

    return {
        total_count: totalCount,
        by_region: byRegion,
    };
}