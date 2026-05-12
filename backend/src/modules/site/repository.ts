// =====================
// File: backend/src/modules/site/repository.ts
// Purpose:
// - Database access layer for site module
// - Keeps SQL and persistence concerns isolated from service/routes
// - Uses shared typed query<T>() helper from db client
// =====================

import {
    query,
    type DbValue,
} from '../../db/client';
import { toFiniteNumber } from '../../shared/utils';

import type {
    SiteCreatePersistenceInput,
    SiteListQueryDto,
    SiteListRepositoryResult,
    SiteMetricBucketDto,
    SitePatchPersistenceInput,
    SiteRow,
} from './types';

interface CountRow {
    total: number | string;
}

interface DeleteRow {
    id: string;
}

interface SiteMetricBucketRow {
    key: string;
    count: number | string;
}

const SITE_SELECT_COLUMNS = `
    s.id,
    s.name,
    s.code,
    s.timezone,
    s.region,
    s.address,
    s.contact,
    s.tags,
    s.created_at,
    s.updated_at,
    s.config,
    s.extra
`;

const toDbJson = (
    value: unknown,
): DbValue => value as DbValue;

function buildWhereClause(
    filters: SiteListQueryDto,
): { clause: string; params: DbValue[] } {
    const params: DbValue[] = [];
    const conditions: string[] = [];

    if (filters.site_ids && filters.site_ids.length > 0) {
        params.push(filters.site_ids);
        conditions.push(`s.id = ANY($${params.length}::text[])`);
    }

    if (filters.region && filters.region.length > 0) {
        params.push(filters.region);
        conditions.push(`s.region = ANY($${params.length}::text[])`);
    }

    if (filters.timezone && filters.timezone.length > 0) {
        params.push(filters.timezone);
        conditions.push(`s.timezone = ANY($${params.length}::text[])`);
    }

    if (filters.tags && filters.tags.length > 0) {
        params.push(filters.tags);
        conditions.push(`COALESCE(s.tags, ARRAY[]::text[]) && $${params.length}::text[]`);
    }

    if (filters.search) {
        params.push(`%${filters.search}%`);
        const searchParamIndex = params.length;

        conditions.push(`
            (
                s.name ILIKE $${searchParamIndex}
                OR COALESCE(s.code, '') ILIKE $${searchParamIndex}
                OR COALESCE(s.region, '') ILIKE $${searchParamIndex}
                OR COALESCE(s.timezone, '') ILIKE $${searchParamIndex}
                OR COALESCE(s.address->>'city', '') ILIKE $${searchParamIndex}
                OR COALESCE(s.address->>'address_line1', '') ILIKE $${searchParamIndex}
                OR COALESCE(s.address->>'postal_code', '') ILIKE $${searchParamIndex}
                OR COALESCE(s.contact->>'name', '') ILIKE $${searchParamIndex}
                OR COALESCE(s.contact->>'email', '') ILIKE $${searchParamIndex}
                OR COALESCE(s.contact->>'phone', '') ILIKE $${searchParamIndex}
                OR EXISTS (
                    SELECT 1
                    FROM unnest(COALESCE(s.tags, ARRAY[]::text[])) AS tag
                    WHERE tag ILIKE $${searchParamIndex}
                )
            )
        `);
    }

    return {
        clause: conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '',
        params,
    };
}

export async function findSiteById(
    id: string,
): Promise<SiteRow | null> {
    const result = await query<SiteRow>(
        `
            SELECT ${SITE_SELECT_COLUMNS}
            FROM sites s
            WHERE s.id = $1
                LIMIT 1
        `,
        [id],
    );

    return result.rows[0] ?? null;
}

export async function findSiteByCode(
    code: string,
    excludeId?: string,
): Promise<SiteRow | null> {
    const result = await query<SiteRow>(
        `
            SELECT ${SITE_SELECT_COLUMNS}
            FROM sites s
            WHERE LOWER(s.code) = LOWER($1)
              AND ($2::text IS NULL OR s.id <> $2)
                LIMIT 1
        `,
        [code, excludeId ?? null],
    );

    return result.rows[0] ?? null;
}

export async function findSiteList(
    filters: SiteListQueryDto,
): Promise<SiteListRepositoryResult> {
    const { clause, params } = buildWhereClause(filters);

    const countResult = await query<CountRow>(
        `
            SELECT COUNT(*)::int AS total
            FROM sites s
                ${clause}
        `,
        params,
    );

    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;
    const offset = (filters.page - 1) * filters.pageSize;

    const itemsResult = await query<SiteRow>(
        `
            SELECT ${SITE_SELECT_COLUMNS}
            FROM sites s
                ${clause}
            ORDER BY s.created_at DESC, s.id DESC
                LIMIT $${limitParamIndex}
            OFFSET $${offsetParamIndex}
        `,
        [...params, filters.pageSize, offset],
    );

    return {
        items: itemsResult.rows,
        total: toFiniteNumber(countResult.rows[0]?.total, 0),
    };
}

export async function countSites(
    filters: SiteListQueryDto,
): Promise<number> {
    const { clause, params } = buildWhereClause(filters);

    const result = await query<CountRow>(
        `
            SELECT COUNT(*)::int AS total
            FROM sites s
                ${clause}
        `,
        params,
    );

    return toFiniteNumber(result.rows[0]?.total, 0);
}

export async function getSiteMetricsByRegion(
    filters: SiteListQueryDto,
): Promise<SiteMetricBucketDto[]> {
    const { clause, params } = buildWhereClause(filters);

    const result = await query<SiteMetricBucketRow>(
        `
            SELECT
                COALESCE(NULLIF(BTRIM(s.region), ''), 'unknown') AS key,
                COUNT(*)::int AS count
            FROM sites s
                ${clause}
            GROUP BY 1
            ORDER BY count DESC, key ASC
        `,
        params,
    );

    return result.rows.map((row): SiteMetricBucketDto => ({
        key: String(row.key),
        count: toFiniteNumber(row.count, 0),
    }));
}

export async function insertSite(
    input: SiteCreatePersistenceInput,
): Promise<SiteRow> {
    const result = await query<SiteRow>(
        `
            INSERT INTO sites (
                id,
                name,
                code,
                timezone,
                region,
                address,
                contact,
                tags,
                config,
                extra,
                created_at,
                updated_at
            )
            VALUES (
                       $1,
                       $2,
                       $3,
                       $4,
                       $5,
                       $6::jsonb,
                       $7::jsonb,
                       $8::text[],
                       $9::jsonb,
                       $10::jsonb,
                       $11::timestamptz,
                       $12::timestamptz
                   )
                RETURNING ${SITE_SELECT_COLUMNS}
        `,
        [
            input.id,
            input.name,
            input.code,
            input.timezone,
            input.region,
            toDbJson(input.address),
            toDbJson(input.contact),
            input.tags,
            toDbJson(input.config),
            toDbJson(input.extra),
            input.created_at,
            input.updated_at,
        ],
    );

    return result.rows[0];
}

export async function updateSiteById(
    id: string,
    patch: SitePatchPersistenceInput,
): Promise<SiteRow | null> {
    const assignments: string[] = [];
    const params: DbValue[] = [];

    params.push(patch.updated_at);
    assignments.push(`updated_at = $${params.length}::timestamptz`);

    if (patch.name !== undefined) {
        params.push(patch.name);
        assignments.push(`name = $${params.length}`);
    }

    if (patch.code !== undefined) {
        params.push(patch.code ?? null);
        assignments.push(`code = $${params.length}`);
    }

    if (patch.timezone !== undefined) {
        params.push(patch.timezone ?? null);
        assignments.push(`timezone = $${params.length}`);
    }

    if (patch.region !== undefined) {
        params.push(patch.region ?? null);
        assignments.push(`region = $${params.length}`);
    }

    if (patch.address !== undefined) {
        params.push(toDbJson(patch.address ?? null));
        assignments.push(`address = $${params.length}::jsonb`);
    }

    if (patch.contact !== undefined) {
        params.push(toDbJson(patch.contact ?? null));
        assignments.push(`contact = $${params.length}::jsonb`);
    }

    if (patch.tags !== undefined) {
        params.push(patch.tags ?? null);
        assignments.push(`tags = $${params.length}::text[]`);
    }

    if (patch.config !== undefined) {
        params.push(toDbJson(patch.config ?? null));
        assignments.push(`config = $${params.length}::jsonb`);
    }

    if (patch.extra !== undefined) {
        params.push(toDbJson(patch.extra ?? null));
        assignments.push(`extra = $${params.length}::jsonb`);
    }

    params.push(id);

    const result = await query<SiteRow>(
        `
            UPDATE sites
            SET ${assignments.join(', ')}
            WHERE id = $${params.length}
                RETURNING ${SITE_SELECT_COLUMNS}
        `,
        params,
    );

    return result.rows[0] ?? null;
}

export async function deleteSiteById(
    id: string,
): Promise<boolean> {
    const result = await query<DeleteRow>(
        `
            DELETE FROM sites
            WHERE id = $1
                RETURNING id
        `,
        [id],
    );

    return Boolean(result.rows[0]);
}