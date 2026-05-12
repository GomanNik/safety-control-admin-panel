// =====================
// File: src/features/site/site-form/types.ts
// Purpose:
// - Types for unified site create/edit form
// - Address is selected only from official registry
// =====================

import type {
    Site,
    SiteApiError,
    SiteCreate,
    SitePatch,
} from '../../../entities/site';

export type SiteFormMode = 'create' | 'edit';

export interface SiteFormAddressSelection {
    source: 'gar_fias';
    registryId: string;

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

export interface SiteFormValues {
    name: string;
    code: string;

    addressQuery: string;
    addressSelection: SiteFormAddressSelection | null;

    contactName: string;
    contactEmail: string;
    contactPhone: string;
    contactPosition: string;
}

export type SiteFormValidationErrorCode =
    | 'required'
    | 'invalid_name'
    | 'invalid_code'
    | 'address_required'
    | 'contact_name_required'
    | 'contact_name_invalid'
    | 'contact_channel_required'
    | 'contact_email_invalid'
    | 'contact_phone_invalid';

export type SiteFormValidationErrorMap = Partial<Record<
    | 'name'
    | 'code'
    | 'addressQuery'
    | 'contactName'
    | 'contactEmail'
    | 'contactPhone',
    SiteFormValidationErrorCode
>>;

export interface SiteFormValidationContext {
    mode: SiteFormMode;
    originalSite?: Site | null;
}

export interface SiteFormValidationResult {
    isValid: boolean;
    values: SiteFormValues;
    errors: SiteFormValidationErrorMap;
}

export interface SiteFormSubmitResult {
    site: Site;
    mode: SiteFormMode;
    payload: SiteCreate | SitePatch;
}

export interface SiteFormModel {
    mode: SiteFormMode;
    site: Site | null;
    loading: boolean;
    error: SiteApiError | null;

    values: SiteFormValues;
    errors: SiteFormValidationErrorMap;

    isDirty: boolean;
    isValid: boolean;
    saving: boolean;
    saveError: SiteApiError | null;

    setFieldValue<Name extends keyof SiteFormValues>(
        name: Name,
        value: SiteFormValues[Name],
    ): void;

    reset(): void;
    submit(): Promise<SiteFormSubmitResult | null>;
}