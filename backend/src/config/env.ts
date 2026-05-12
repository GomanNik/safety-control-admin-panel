// =====================
// File: backend/src/config/env.ts
// Purpose:
// - Backend environment reader and normalizer
// - Aligns backend runtime defaults with current frontend expectations:
//   - API base path: /api
//   - Dev port: 3000
//   - Realtime path reserved as /realtime
// - Uses node-only env access and does not depend on frontend/browser config code
// =====================

import 'dotenv/config';

import { z } from 'zod';

export type BackendEnvironmentName =
    | 'development'
    | 'test'
    | 'staging'
    | 'production';

export interface BackendEnv {
    appEnv: BackendEnvironmentName;
    host: string;
    port: number;
    databaseUrl: string;
    apiBasePath: string;
    corsOrigins: string[];
    realtimeEnabled: boolean;
    realtimePath: string;
    jsonBodyLimit: string;
    shutdownTimeoutMs: number;
}

const booleanLikeSchema = z.preprocess(
    (value) => {
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();

            if (
                normalized === '1' ||
                normalized === 'true' ||
                normalized === 'yes' ||
                normalized === 'on'
            ) {
                return true;
            }

            if (
                normalized === '0' ||
                normalized === 'false' ||
                normalized === 'no' ||
                normalized === 'off'
            ) {
                return false;
            }
        }

        return value;
    },
    z.boolean(),
);

const rawEnvSchema = z.object({
    APP_ENV: z.string().trim().optional(),
    NODE_ENV: z.string().trim().optional(),

    HOST: z.string().trim().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    DATABASE_URL: z.string().trim().min(1),

    API_BASE_PATH: z.string().trim().optional(),
    CORS_ORIGINS: z.string().trim().optional(),

    REALTIME_ENABLED: booleanLikeSchema.optional().default(true),
    REALTIME_PATH: z.string().trim().optional(),

    JSON_BODY_LIMIT: z.string().trim().min(1).default('1mb'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(10_000),
});

function normalizeEnvironmentName(
    value: string | undefined,
): BackendEnvironmentName {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();

    if (normalized === 'production' || normalized === 'prod') {
        return 'production';
    }

    if (normalized === 'test' || normalized === 'testing') {
        return 'test';
    }

    if (normalized === 'staging' || normalized === 'stage') {
        return 'staging';
    }

    return 'development';
}

function normalizePath(
    value: string | undefined,
    fallback: string,
): string {
    const normalized = String(value ?? '')
        .trim();

    const source = normalized.length > 0
        ? normalized
        : fallback;

    const withLeadingSlash = source.startsWith('/')
        ? source
        : `/${source}`;

    const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
    const withoutTrailingSlash =
        collapsed.length > 1
            ? collapsed.replace(/\/+$/, '')
            : collapsed;

    return withoutTrailingSlash || fallback;
}

function normalizeCsvList(
    value: string | undefined,
): string[] {
    if (!value) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .split(/[,\n;]+/g)
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );
}

export function resolveEnv(): BackendEnv {
    const raw = rawEnvSchema.parse(process.env);

    return {
        appEnv: normalizeEnvironmentName(raw.APP_ENV ?? raw.NODE_ENV),
        host: raw.HOST,
        port: raw.PORT,
        databaseUrl: raw.DATABASE_URL,
        apiBasePath: normalizePath(raw.API_BASE_PATH, '/api'),
        corsOrigins: normalizeCsvList(raw.CORS_ORIGINS),
        realtimeEnabled: raw.REALTIME_ENABLED,
        realtimePath: normalizePath(raw.REALTIME_PATH, '/realtime'),
        jsonBodyLimit: raw.JSON_BODY_LIMIT,
        shutdownTimeoutMs: raw.SHUTDOWN_TIMEOUT_MS,
    };
}

export const env: BackendEnv = Object.freeze(resolveEnv());