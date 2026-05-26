// =====================
// shared/api/primitives.ts
// =====================

import type { ApiListMeta, ApiListRequest } from './types';

/**
 * ISO 8601 datetime string used by backend.
 */
export type IsoDateTimeString = string;

/**
 * Generic nullable helper.
 */
export type Nullable<T> = T | null;

/**
 * Primitive ID types.
 * Keep them in one place to ensure consistency across domains.
 */
export type IncidentId = string;
export type CameraId = string;
export type SiteId = string;
export type ReportId = string;

/**
 * Каноничные типы пагинации завязаны на ApiList* из ./types.
 * Эти алиасы оставляем — не про user/rbac/уведомления.
 */
export type PaginationRequest = ApiListRequest;
export type PaginationMeta = ApiListMeta;
