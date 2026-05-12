// =====================
// File: src/entities/address-registry/types.ts
// Purpose:
// - Public contracts for official address registry lookup
// - Frontend consumes only normalized building suggestions
// =====================

import type { ApiErrorLike } from '../../shared/api';

export type AddressRegistrySource = 'gar_fias';

export interface AddressRegistrySearchQueryDto {
    query: string;
    limit?: number;
}

export interface AddressRegistryBuildingDto {
    id: string;
    source: AddressRegistrySource;

    label: string;
    short_label?: string;

    object_guid?: string;
    object_id?: string;
    house_guid?: string;
    house_id?: string;

    region?: string;
    city?: string;
    settlement?: string;
    street?: string;
    house?: string;
    building?: string;
    postal_code?: string;

    okato?: string;
    oktmo?: string;
}

export interface AddressRegistrySearchResponseDto {
    items: AddressRegistryBuildingDto[];
}

export interface AddressRegistryBuilding {
    id: string;
    source: AddressRegistrySource;

    label: string;
    shortLabel?: string;

    objectGuid?: string;
    objectId?: string;
    houseGuid?: string;
    houseId?: string;

    region?: string;
    city?: string;
    settlement?: string;
    street?: string;
    house?: string;
    building?: string;
    postalCode?: string;

    okato?: string;
    oktmo?: string;
}

export type AddressRegistryApiError = ApiErrorLike;