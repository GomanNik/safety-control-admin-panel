// =====================
// File: src/features/camera/camera-filters/storage.ts
// Purpose:
//   Persistence layer для фильтров камер под новый контракт:
//   - siteId
//   - statuses
//   - search
// =====================

import {
    type CameraListFilters,
    type CameraStatus,
    CAMERA_STATUS_VALUES,
} from '../../../entities/camera';

import type { CameraFiltersStorageDriver } from './types';

export const CAMERA_FILTERS_STORAGE_KEY = 'camera.filters.v3' as const;

type PersistedCameraFiltersV3 = {
    v: 3;
    savedAt: number;
    filters: CameraListFilters;
};

const isRecord = (
    value: unknown,
): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const safeGetDefaultStorage = (): Storage | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

const safeParseJson = (
    raw: string,
): unknown => {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
};

const unique = <T,>(
    items: readonly T[],
): T[] => {
    return Array.from(new Set(items));
};

const toStringArray = (
    value: unknown,
): string[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const cleaned = unique(
        value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean),
    );

    return cleaned.length > 0 ? cleaned : undefined;
};

const toEnumArray = <T extends string>(
    value: unknown,
    allowed: readonly T[],
): T[] | undefined => {
    const items = toStringArray(value);

    if (!items) {
        return undefined;
    }

    const normalizedLookup = new Map<string, T>(
        allowed.map((item) => [item.trim().toLowerCase(), item]),
    );

    const filtered = unique(
        items
            .map((item) => normalizedLookup.get(item.toLowerCase()))
            .filter((item): item is T => item !== undefined),
    );

    return filtered.length > 0 ? filtered : undefined;
};

const toOptionalString = (
    value: unknown,
): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : undefined;
};

const sanitizeFilters = (
    filters: unknown,
): CameraListFilters => {
    if (!isRecord(filters)) {
        return {};
    }

    const out: CameraListFilters = {};

    const siteId = toOptionalString(filters.siteId);
    const statuses = toEnumArray<CameraStatus>(
        filters.statuses,
        CAMERA_STATUS_VALUES,
    );
    const search = toOptionalString(filters.search);

    if (siteId) {
        out.siteId = siteId as CameraListFilters['siteId'];
    }

    if (statuses) {
        out.statuses = statuses;
    }

    if (search) {
        out.search = search;
    }

    return out;
};

export interface CreateCameraFiltersStorageDriverOptions {
    key?: string;
    storage?: Storage | null;
}

export const createCameraFiltersStorageDriver = (
    options?: CreateCameraFiltersStorageDriverOptions,
): CameraFiltersStorageDriver => {
    const key = options?.key?.trim() || CAMERA_FILTERS_STORAGE_KEY;
    const storage = options?.storage ?? safeGetDefaultStorage();

    const load = (): CameraListFilters | null => {
        if (!storage) {
            return null;
        }

        try {
            const raw = storage.getItem(key);

            if (!raw) {
                return null;
            }

            const parsed = safeParseJson(raw);

            if (!isRecord(parsed) || parsed.v !== 3) {
                return null;
            }

            return sanitizeFilters(parsed.filters);
        } catch {
            return null;
        }
    };

    const save = (filters: CameraListFilters): void => {
        if (!storage) {
            return;
        }

        try {
            const payload: PersistedCameraFiltersV3 = {
                v: 3,
                savedAt: Date.now(),
                filters: sanitizeFilters(filters),
            };

            storage.setItem(key, JSON.stringify(payload));
        } catch {
            // noop
        }
    };

    const clear = (): void => {
        if (!storage) {
            return;
        }

        try {
            storage.removeItem(key);
        } catch {
            // noop
        }
    };

    return {
        load,
        save,
        clear,
    };
};