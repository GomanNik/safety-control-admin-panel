// =====================
// features/incident/incident-details/hooks.ts
// =====================

import { useMemo } from 'react';

import {
    type IncidentFormatterOptions,
    selectActiveIncidentId,
    useIncidentQuery,
    useIncidentUIStore,
} from '../../../entities/incident';
import { useI18nContext } from '../../../shared/i18n';

import {
    buildIncidentDetailsQueryView,
    buildIncidentDetailsView,
} from './mappers';
import type {
    IncidentDetailsIncidentId,
    IncidentDetailsIncidentView,
    IncidentDetailsQueryOptions,
    IncidentDetailsQueryView,
    UseIncidentDetailsQueryResult,
} from './types';
import {
    EMPTY_INCIDENT_DETAILS_ID,
    normalizeIncidentDetailsId,
} from './validation';

function useIncidentDetailsQueryInternal(
    activeIncidentId: IncidentDetailsIncidentId | null,
    isPanelOpen: boolean,
    options?: IncidentDetailsQueryOptions,
): UseIncidentDetailsQueryResult {
    const { t, locale } = useI18nContext();

    const formatterOptions = useMemo<IncidentFormatterOptions>(() => ({
        t,
        locale,
    }), [t, locale]);

    const normalizedIncidentId = normalizeIncidentDetailsId(activeIncidentId);

    const isEnabled = (options?.enabled ?? true)
        && isPanelOpen
        && Boolean(normalizedIncidentId);

    const safeIncidentId = normalizedIncidentId ?? EMPTY_INCIDENT_DETAILS_ID;

    const rawQuery = useIncidentQuery(
        safeIncidentId,
        {
            ...options,
            enabled: isEnabled,
        },
    );

    const query = useMemo<IncidentDetailsQueryView>(() => (
        buildIncidentDetailsQueryView({
            incidentId: normalizedIncidentId,
            isEnabled,
            rawQuery: {
                data: rawQuery.data,
                error: rawQuery.error,
                isLoading: rawQuery.isLoading,
                isFetching: rawQuery.isFetching,
                isSuccess: rawQuery.isSuccess,
                isError: rawQuery.isError,
                isPending: 'isPending' in rawQuery
                    ? rawQuery.isPending
                    : undefined,
                status: 'status' in rawQuery && typeof rawQuery.status === 'string'
                    ? rawQuery.status
                    : undefined,
                fetchStatus: 'fetchStatus' in rawQuery
                && typeof rawQuery.fetchStatus === 'string'
                    ? rawQuery.fetchStatus
                    : undefined,
                isPlaceholderData: 'isPlaceholderData' in rawQuery
                && typeof rawQuery.isPlaceholderData === 'boolean'
                    ? rawQuery.isPlaceholderData
                    : undefined,
                refetch: () => rawQuery.refetch() as Promise<unknown>,
            },
        })
    ), [
        normalizedIncidentId,
        isEnabled,
        rawQuery,
    ]);

    const incident = useMemo<IncidentDetailsIncidentView>(() => (
        buildIncidentDetailsView(query.incident, formatterOptions)
    ), [query.incident, formatterOptions]);

    return useMemo<UseIncidentDetailsQueryResult>(() => ({
        query,
        incident,
    }), [query, incident]);
}

export function useIncidentDetailsQueryById(
    incidentId: IncidentDetailsIncidentId | null | undefined,
    options?: IncidentDetailsQueryOptions,
): UseIncidentDetailsQueryResult {
    const normalizedIncidentId = normalizeIncidentDetailsId(incidentId);

    return useIncidentDetailsQueryInternal(
        normalizedIncidentId,
        true,
        options,
    );
}

export function useIncidentDetailsQuery(
    options?: IncidentDetailsQueryOptions,
): UseIncidentDetailsQueryResult {
    const { state } = useIncidentUIStore();

    const activeIncidentId = selectActiveIncidentId(state);
    const isPanelOpen = Boolean(state.isDetailsPanelOpen);

    return useIncidentDetailsQueryInternal(
        activeIncidentId,
        isPanelOpen,
        options,
    );
}