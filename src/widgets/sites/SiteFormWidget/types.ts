// =====================
// File: src/widgets/sites/SiteFormWidget/types.ts
// Purpose:
// - Public contracts for the site form widget
// - Address is selected only from official registry
// =====================

import type { HTMLAttributes } from 'react';

import type { AddressRegistryBuilding } from '../../../entities/address-registry';
import type { Site } from '../../../entities/site';

import type {
    SiteFormAddressSelection as FeatureSiteFormAddressSelection,
    SiteFormMode as FeatureSiteFormMode,
    SiteFormValidationErrorMap,
    SiteFormValues as FeatureSiteFormValues,
} from '../../../features/site';

export type SiteFormMode = FeatureSiteFormMode;
export type SiteFormValues = FeatureSiteFormValues;
export type SiteFormAddressSelection = FeatureSiteFormAddressSelection;

export interface SiteFormWidgetProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    mode: SiteFormMode;
    siteId?: Site['id'] | null;
    onSaved?: (site: Site) => void;
    onCancel?: () => void;
}

export type SiteFormFieldName = keyof SiteFormValues;
export type SiteFormErrorFieldName = keyof SiteFormValidationErrorMap;
export type SiteFormFieldErrors = Partial<Record<
    keyof SiteFormValidationErrorMap,
    string
>>;

export interface SiteFormWidgetViewModel {
    mode: SiteFormMode;

    title: string;
    subtitle: string;

    values: SiteFormValues;
    errors: SiteFormFieldErrors;

    isLoading: boolean;
    isSaving: boolean;
    isDirty: boolean;
    isValid: boolean;

    loadError: string | null;
    saveError: string | null;

    primaryActionLabel: string;
    secondaryActionLabel: string;
    cancelActionLabel: string;

    codeHelpText: string;
    canRegenerateCode: boolean;

    selectedAddress: SiteFormAddressSelection | null;
    addressSuggestions: ReadonlyArray<AddressRegistryBuilding>;
    addressLookupActivated: boolean;
    addressLookupLoading: boolean;
    addressLookupError: string | null;
    showLegacyAddressWarning: boolean;
    legacyAddressText: string | null;

    setFieldValue<Name extends SiteFormFieldName>(
        name: Name,
        value: SiteFormValues[Name],
    ): void;

    markFieldTouched(name: SiteFormFieldName): void;

    setAddressQuery(value: string): void;
    selectAddressSuggestion(suggestion: AddressRegistryBuilding): void;
    clearSelectedAddress(): void;
    regenerateCode(): void;

    reset(): void;
    submit(): Promise<void>;
    cancel(): void;
}