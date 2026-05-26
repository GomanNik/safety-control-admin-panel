// =====================
// File: backend/src/modules/site/schemas.ts
// Purpose:
// - Zod schemas for backend site module
// - Handles repeat-key query params and body normalization entry points
// - Reuses shared normalization helpers where it makes sense
// =====================

import { z } from 'zod';

import {
    normalizeNullableText,
    normalizeOptionalText,
    normalizeStringArray,
} from '../../shared/utils';

const positiveIntegerSchema = z.coerce.number().int().min(1);
const finiteNumberSchema = z.number().finite();

const normalizeRepeatableQueryStringArray = (
    value: unknown,
): string[] | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }

    const source = Array.isArray(value)
        ? value
        : [value];

    return normalizeStringArray(source);
};

const jsonRecordSchema = z.record(z.string(), z.unknown());

const optionalStringFieldSchema = z.preprocess(
    normalizeOptionalText,
    z.string().min(1).optional(),
);

const nullableStringFieldSchema = z.preprocess(
    normalizeNullableText,
    z.string().min(1).nullable().optional(),
);

const queryStringArraySchema = z.preprocess(
    normalizeRepeatableQueryStringArray,
    z.array(z.string().min(1)).optional(),
);

const bodyStringArraySchema = z.preprocess(
    normalizeStringArray,
    z.array(z.string().min(1)).optional(),
);

export const siteIdParamsSchema = z.object({
    id: z.string().trim().min(1),
});

export const siteAddressSchema = z.object({
    country: z.preprocess(
        normalizeOptionalText,
        z.string().min(1),
    ),
    region: optionalStringFieldSchema,
    city: optionalStringFieldSchema,
    address_line1: optionalStringFieldSchema,
    address_line2: optionalStringFieldSchema,
    postal_code: optionalStringFieldSchema,
    latitude: finiteNumberSchema.optional(),
    longitude: finiteNumberSchema.optional(),
});

export const siteContactSchema = z.object({
    name: z.preprocess(
        normalizeOptionalText,
        z.string().min(1),
    ),
    email: optionalStringFieldSchema,
    phone: optionalStringFieldSchema,
    position: optionalStringFieldSchema,
});

export const siteCreateSchema = z.object({
    name: z.preprocess(
        normalizeOptionalText,
        z.string().min(1),
    ),
    code: nullableStringFieldSchema,
    timezone: nullableStringFieldSchema,
    region: nullableStringFieldSchema,
    address: siteAddressSchema.nullable().optional(),
    contact: siteContactSchema.nullable().optional(),
    tags: bodyStringArraySchema,
    config: jsonRecordSchema.optional(),
});

export const sitePatchSchema = z.object({
    name: z.preprocess(
        normalizeOptionalText,
        z.string().min(1).optional(),
    ),
    code: nullableStringFieldSchema,
    timezone: nullableStringFieldSchema,
    region: nullableStringFieldSchema,
    address: siteAddressSchema.nullable().optional(),
    contact: siteContactSchema.nullable().optional(),
    tags: bodyStringArraySchema,
    config: jsonRecordSchema.optional(),
});

export const siteListQuerySchema = z.object({
    page: positiveIntegerSchema.default(1),
    pageSize: positiveIntegerSchema.max(100).default(25),
    site_ids: queryStringArraySchema,
    region: queryStringArraySchema,
    timezone: queryStringArraySchema,
    search: z.preprocess(
        normalizeOptionalText,
        z.string().min(1).optional(),
    ),
    tags: queryStringArraySchema,
});