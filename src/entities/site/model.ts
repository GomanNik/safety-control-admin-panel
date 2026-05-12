// =====================
// File: src/entities/site/model.ts
// Purpose:
// - Domain model for Site entity
// =====================

import type { SiteId } from '../../shared/api';

export interface SiteAddress {
    country: string;
    region?: string;
    city?: string;
    addressLine1?: string;
    addressLine2?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
}

export interface SiteContact {
    name: string;
    email?: string;
    phone?: string;
    position?: string;
}

export interface Site {
    id: SiteId;
    name: string;
    code?: string;
    timezone?: string;
    region?: string;
    address?: SiteAddress;
    contact?: SiteContact;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    config?: Record<string, unknown>;
    extra?: Record<string, unknown>;
}

export interface SiteCreate {
    name: string;
    code?: string | null;
    timezone?: string | null;
    region?: string | null;
    address?: SiteAddress | null;
    contact?: SiteContact | null;
    tags?: string[];
    config?: Record<string, unknown>;
}

export interface SitePatch {
    name?: string;
    code?: string | null;
    timezone?: string | null;
    region?: string | null;
    address?: SiteAddress | null;
    contact?: SiteContact | null;
    tags?: string[];
    config?: Record<string, unknown>;
}

export interface SiteMetrics {
    totalCount: number;
    byRegion: {
        region: string;
        count: number;
    }[];
}