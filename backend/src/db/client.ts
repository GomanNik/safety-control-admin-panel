// =====================
// File: backend/src/db/client.ts
// Purpose:
// - Shared PostgreSQL client for backend
// - Exposes lightweight typed query<T>() helper for repositories
// - Avoids pg generic row constraints leaking into module row types
// =====================

import { Pool } from 'pg';

import { env } from '../config/env';

export interface DbQueryResult<TRow> {
    rows: TRow[];
    rowCount: number;
}

export type DbJsonPrimitive =
    | string
    | number
    | boolean
    | null;

export interface DbJsonObject {
    [key: string]: DbJsonValue;
}

export type DbJsonValue =
    | DbJsonPrimitive
    | DbJsonObject
    | DbJsonValue[];

export type DbValue =
    | string
    | number
    | boolean
    | null
    | Date
    | Buffer
    | string[]
    | number[]
    | boolean[]
    | DbJsonObject
    | DbJsonValue[];

export const pool = new Pool({
    connectionString: env.databaseUrl,
});

pool.on('error', (error: Error) => {
    console.error('[db] unexpected idle client error', error);
});

export async function query<TRow = unknown>(
    sql: string,
    params: DbValue[] = [],
): Promise<DbQueryResult<TRow>> {
    const result = await pool.query(
        sql,
        params as unknown[],
    );

    return {
        rows: result.rows as TRow[],
        rowCount: result.rowCount ?? 0,
    };
}

export async function closePool(): Promise<void> {
    await pool.end();
}