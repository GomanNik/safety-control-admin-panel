// =====================
// File: src/features/site/site-delete/types.ts
// Purpose:
// - Public contracts for site delete feature
// - Site deletion is always allowed from frontend perspective
// - Backend is expected to perform cascade delete for linked entities
// =====================

import type { SiteApiError } from '../../../entities/site';
import type { SiteId } from '../../../shared/api';

export interface SiteDeleteRequest {
    siteId: SiteId;
}

export interface SiteDeleteResult {
    siteId: SiteId;
}

export interface UseSiteDeleteFeatureResult {
    isDeleting: boolean;
    error: SiteApiError | null;

    remove(request: SiteDeleteRequest): Promise<SiteDeleteResult>;
    reset(): void;
}