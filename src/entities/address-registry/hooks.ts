// =====================
// File: src/entities/address-registry/hooks.ts
// Purpose:
// - React Query hooks for official address registry lookup
// - All address suggestions must come from backend proxy over official source
// =====================

import { useMemo } from 'react';

import type { UseQueryResult } from '@tanstack/react-query';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
    normalizeHttpError,
    useApiClient,
} from '../../shared/api';

import {
    createAddressRegistryApiClient,
    type AddressRegistryApiClient,
} from './api';

import type {
    AddressRegistryApiError,
    AddressRegistryBuilding,
    AddressRegistryBuildingDto,
} from './types';

export interface UseAddressRegistrySearchOptions {
    enabled?: boolean;
    limit?: number;
    keepPreviousData?: boolean;
}

export const addressRegistryQueryKeys = {
    all: ['address-registry'] as const,
    buildings: (
        query: string,
        limit: number,
    ) => ['address-registry', 'buildings', query, limit] as const,
};

function useAddressRegistryApiClient(): AddressRegistryApiClient {
    return useApiClient(createAddressRegistryApiClient);
}

const normalizeText = (
    value: unknown,
): string => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

function mapBuildingDtoToModel(
    dto: AddressRegistryBuildingDto,
): AddressRegistryBuilding {
    return {
        id: normalizeText(dto.id),
        source: dto.source,
        label: normalizeText(dto.label),
        shortLabel: normalizeText(dto.short_label) || undefined,
        objectGuid: normalizeText(dto.object_guid) || undefined,
        objectId: normalizeText(dto.object_id) || undefined,
        houseGuid: normalizeText(dto.house_guid) || undefined,
        houseId: normalizeText(dto.house_id) || undefined,
        region: normalizeText(dto.region) || undefined,
        city: normalizeText(dto.city) || undefined,
        settlement: normalizeText(dto.settlement) || undefined,
        street: normalizeText(dto.street) || undefined,
        house: normalizeText(dto.house) || undefined,
        building: normalizeText(dto.building) || undefined,
        postalCode: normalizeText(dto.postal_code) || undefined,
        okato: normalizeText(dto.okato) || undefined,
        oktmo: normalizeText(dto.oktmo) || undefined,
    };
}

export function useAddressRegistrySearchQuery(
    rawQuery: string,
    options?: UseAddressRegistrySearchOptions,
): UseQueryResult<AddressRegistryBuilding[], AddressRegistryApiError> {
    const client = useAddressRegistryApiClient();

    const query = useMemo(
        () => normalizeText(rawQuery),
        [rawQuery],
    );

    const limit = options?.limit ?? 8;
    const enabled = (options?.enabled ?? true) && query.length >= 3;

    return useQuery<AddressRegistryBuilding[], AddressRegistryApiError>({
        queryKey: addressRegistryQueryKeys.buildings(query, limit),
        enabled,
        placeholderData: options?.keepPreviousData
            ? keepPreviousData
            : undefined,
        queryFn: async ({ signal }) => {
            try {
                const response = await client.searchBuildings(
                    {
                        query,
                        limit,
                    },
                    { signal },
                );

                return (response.items ?? [])
                    .map(mapBuildingDtoToModel)
                    .filter((item) => item.id && item.label);
            } catch (error) {
                throw normalizeHttpError(error) as AddressRegistryApiError;
            }
        },
    });
}