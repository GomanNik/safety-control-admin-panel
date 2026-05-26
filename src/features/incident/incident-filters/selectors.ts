// =====================
// features/incident/incident-filters/selectors.ts
// =====================

import type {
    IncidentListFilters,
    IncidentListQuery,
    IncidentSortOption,
    IncidentUIState,
} from '../../../entities/incident';
import {
    IncidentSeverity,
    IncidentSortField,
    IncidentType,
    SortDirection,
    selectIncidentFilters,
    selectIncidentPagination,
    selectIncidentSort,
} from '../../../entities/incident';
import type {
    IncidentFiltersPagination,
    IncidentFiltersQuery,
    IncidentFiltersSort,
    IncidentFiltersValue,
    IncidentFiltersViewState,
} from './types';

const INCIDENT_SEVERITY_VALUES = new Set<string>(Object.values(IncidentSeverity));
const INCIDENT_TYPE_VALUES = new Set<string>(Object.values(IncidentType));
const INCIDENT_SORT_FIELD_VALUES = new Set<string>(Object.values(IncidentSortField));
const SORT_DIRECTION_VALUES = new Set<string>(Object.values(SortDirection));

function toTrimmedString(value: unknown): string {
    return String(value ?? '').trim();
}

function toLowerTrimmedString(value: unknown): string {
    return toTrimmedString(value).toLowerCase();
}

function clampPositiveInt(value: unknown, fallback: number): number {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    const normalized = Math.floor(numeric);

    if (normalized <= 0) {
        return fallback;
    }

    return normalized;
}

function toValidDateOrUndefined(value: unknown): Date | undefined {
    if (value == null) {
        return undefined;
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return undefined;
        }

        return new Date(value.getTime());
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) {
            return undefined;
        }

        return parsed;
    }

    return undefined;
}

function toFiniteNumberOrUndefined(value: unknown): number | undefined {
    if (value == null || value === '') {
        return undefined;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return undefined;
    }

    return numeric;
}

function normalizeOrderedStringArray<T extends string>(value: unknown): T[] {
    if (!Array.isArray(value) || value.length === 0) {
        return [];
    }

    const seen = new Set<string>();
    const result: T[] = [];

    for (const item of value) {
        const trimmed = toTrimmedString(item);

        if (!trimmed) {
            continue;
        }

        const key = trimmed.toLowerCase();

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(trimmed as T);
    }

    return result;
}

function normalizeSortedStringArray<T extends string>(value: unknown): T[] {
    return normalizeOrderedStringArray<T>(value)
        .sort((left, right) => left.localeCompare(right));
}

function normalizeEnumArray<T extends string>(
    value: unknown,
    allowedValues: ReadonlySet<string>,
): T[] {
    return normalizeSortedStringArray<T>(value)
        .filter((item) => allowedValues.has(item));
}

function normalizeIncidentTimeRange(
    value: IncidentListFilters['timeRange'],
): IncidentListFilters['timeRange'] | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const from = toValidDateOrUndefined(value.from);
    const to = toValidDateOrUndefined(value.to);

    if (!from && !to) {
        return undefined;
    }

    return { from, to };
}

export function createEmptyIncidentFilters(): IncidentFiltersValue {
    return {
        siteIds: [],
        cameraIds: [],
        severities: [],
        types: [],
        search: '',
        tags: [],
    };
}

export function normalizeIncidentFilters(
    filters?: IncidentListFilters,
): IncidentFiltersValue {
    const source = filters ?? createEmptyIncidentFilters();

    let minConfidence = toFiniteNumberOrUndefined(source.minConfidence);
    let maxConfidence = toFiniteNumberOrUndefined(source.maxConfidence);

    if (
        minConfidence !== undefined
        && maxConfidence !== undefined
        && minConfidence > maxConfidence
    ) {
        const previousMin = minConfidence;
        minConfidence = maxConfidence;
        maxConfidence = previousMin;
    }

    return {
        timeRange: normalizeIncidentTimeRange(source.timeRange),

        siteIds: normalizeOrderedStringArray(source.siteIds),
        cameraIds: normalizeOrderedStringArray(source.cameraIds),

        severities: normalizeEnumArray<IncidentSeverity>(
            source.severities,
            INCIDENT_SEVERITY_VALUES,
        ),
        types: normalizeEnumArray<IncidentType>(
            source.types,
            INCIDENT_TYPE_VALUES,
        ),

        minConfidence,
        maxConfidence,

        search: toTrimmedString(source.search),
        tags: normalizeSortedStringArray(source.tags),
    };
}

export function normalizeIncidentSort(
    sort?: IncidentSortOption[],
): IncidentFiltersSort {
    if (!Array.isArray(sort) || sort.length === 0) {
        return [];
    }

    const seenFields = new Set<string>();
    const result: IncidentSortOption[] = [];

    for (const item of sort) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        const field = toLowerTrimmedString(item.field);
        const direction = toLowerTrimmedString(item.direction);

        if (!INCIDENT_SORT_FIELD_VALUES.has(field)) {
            continue;
        }

        if (!SORT_DIRECTION_VALUES.has(direction)) {
            continue;
        }

        if (seenFields.has(field)) {
            continue;
        }

        seenFields.add(field);

        result.push({
            field: field as IncidentSortField,
            direction: direction as SortDirection,
        });
    }

    return result;
}

export function normalizeIncidentPagination(
    pagination?: IncidentListQuery['pagination'],
): IncidentFiltersPagination {
    return {
        page: clampPositiveInt(pagination?.page, 1),
        pageSize: clampPositiveInt(pagination?.pageSize, 25),
    };
}

export function buildIncidentListQuery(
    filters?: IncidentListFilters,
    sort?: IncidentSortOption[],
    pagination?: IncidentListQuery['pagination'],
): IncidentFiltersQuery {
    return {
        filters: normalizeIncidentFilters(filters),
        sort: normalizeIncidentSort(sort),
        pagination: normalizeIncidentPagination(pagination),
    };
}

export function selectIncidentHasNonDefaultFilters(
    filters?: IncidentListFilters,
): boolean {
    const normalized = normalizeIncidentFilters(filters);

    return Boolean(
        normalized.timeRange?.from
        || normalized.timeRange?.to
        || (normalized.siteIds?.length ?? 0) > 0
        || (normalized.cameraIds?.length ?? 0) > 0
        || (normalized.severities?.length ?? 0) > 0
        || (normalized.types?.length ?? 0) > 0
        || normalized.minConfidence !== undefined
        || normalized.maxConfidence !== undefined
        || normalized.search
        || (normalized.tags?.length ?? 0) > 0
    );
}

export function selectIncidentFiltersQuery(
    state: IncidentUIState,
): IncidentFiltersQuery {
    return buildIncidentListQuery(
        selectIncidentFilters(state),
        selectIncidentSort(state),
        selectIncidentPagination(state),
    );
}

export function selectIncidentFiltersStateView(
    state: IncidentUIState,
): IncidentFiltersViewState {
    const filters = normalizeIncidentFilters(selectIncidentFilters(state));
    const sort = normalizeIncidentSort(selectIncidentSort(state));
    const pagination = normalizeIncidentPagination(selectIncidentPagination(state));

    return {
        filters,
        sort,
        pagination,
        hasNonDefaultFilters: selectIncidentHasNonDefaultFilters(filters),
        hasSorting: sort.length > 0,
    };
}