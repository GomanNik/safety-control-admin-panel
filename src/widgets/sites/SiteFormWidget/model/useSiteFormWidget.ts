// =====================
// File: src/widgets/sites/SiteFormWidget/model/useSiteFormWidget.ts
// Purpose:
// - Widget adapter over site form feature
// - Keeps address selection restricted to the official registry
// - Handles code autogeneration from site name only in create mode
// - Maps validation error codes to translated user-facing text
// - Suppresses legacy-address empty lookup state until user actually edits query
// - Applies controlled Russian phone formatting in the widget layer
// =====================

import { useCallback, useEffect, useMemo, useState } from "react";

import { useI18nContext } from "../../../../shared/i18n";
import {
    useAddressRegistrySearchQuery,
    type AddressRegistryBuilding,
} from "../../../../entities/address-registry";
import {
    type SiteFormValidationErrorCode,
    generateSiteCodeFromName,
    getSiteFormInitialAddressQuery,
    siteNeedsAddressRegistryBinding,
    useSiteFormModel,
} from "../../../../features/site";
import type {
    SiteFormErrorFieldName,
    SiteFormFieldErrors,
    SiteFormFieldName,
    SiteFormWidgetProps,
    SiteFormWidgetViewModel,
} from "../types";

const PHONE_MAX_NATIONAL_DIGITS = 10;
const PHONE_MAX_EIGHT_FORMAT_DIGITS = 11;

function normalizeText(value: unknown): string {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeLookupToken(value: unknown, locale: string): string {
    return normalizeText(value).replace(/ё/g, "е").toLocaleLowerCase(locale);
}

function extractDigits(value: unknown): string {
    return String(value ?? "").replace(/\D/g, "");
}

function formatPhoneByPrefix(
    prefix: "+7" | "8",
    nationalDigitsRaw: string,
): string {
    const nationalDigits = extractDigits(nationalDigitsRaw).slice(
        0,
        PHONE_MAX_NATIONAL_DIGITS,
    );

    let result = prefix;

    if (nationalDigits.length > 0) {
        result += ` (${nationalDigits.slice(0, 3)}`;
    }

    if (nationalDigits.length >= 3) {
        result += ")";
    }

    if (nationalDigits.length > 3) {
        result += ` ${nationalDigits.slice(3, 6)}`;
    }

    if (nationalDigits.length > 6) {
        result += `-${nationalDigits.slice(6, 8)}`;
    }

    if (nationalDigits.length > 8) {
        result += `-${nationalDigits.slice(8, 10)}`;
    }

    return result;
}

function formatContactPhoneInput(
    value: unknown,
): string {
    const raw = String(value ?? "");
    const trimmed = raw.trim();

    if (!trimmed) {
        return "";
    }

    const digits = extractDigits(trimmed);

    if (!digits) {
        return "";
    }

    const normalizedStartsWithPlusSeven =
        trimmed.startsWith("+7") ||
        trimmed.startsWith("7") ||
        digits.startsWith("7");

    if (normalizedStartsWithPlusSeven) {
        const nationalDigits = digits.startsWith("7")
            ? digits.slice(1)
            : digits;

        return formatPhoneByPrefix("+7", nationalDigits);
    }

    if (digits.startsWith("8")) {
        const normalizedDigits = digits.slice(0, PHONE_MAX_EIGHT_FORMAT_DIGITS);
        const nationalDigits = normalizedDigits.slice(1);

        if (!nationalDigits) {
            return "8";
        }

        return formatPhoneByPrefix("8", nationalDigits);
    }

    return formatPhoneByPrefix("+7", digits);
}

function getErrorMessage(value: unknown, fallback: string): string {
    if (
        value &&
        typeof value === "object" &&
        "message" in value &&
        typeof (value as { message?: unknown }).message === "string"
    ) {
        const message = normalizeText((value as { message: string }).message);

        if (message) {
            return message;
        }
    }

    return fallback;
}

function translateValidationError(
    field: SiteFormErrorFieldName,
    code: SiteFormValidationErrorCode,
    t: ReturnType<typeof useI18nContext>["t"],
): string {
    switch (code) {
        case "required":
            switch (field) {
                case "name":
                    return t("site.form.validation.nameRequired");

                case "code":
                    return t("site.form.validation.codeRequired");

                case "addressQuery":
                    return t("site.form.validation.registryRequired");

                case "contactName":
                    return t("site.form.validation.contactNameRequired");

                default:
                    return t("site.form.validation.required");
            }

        case "invalid_name":
            return t("site.form.validation.nameInvalid");

        case "invalid_code":
            return t("site.form.validation.codeInvalid");

        case "address_required":
            return t("site.form.validation.registryRequired");

        case "contact_name_required":
            return t("site.form.validation.contactNameRequired");

        case "contact_name_invalid":
            return t("site.form.validation.contactNameInvalid");

        case "contact_channel_required":
            return t("site.form.validation.contactMethodRequired");

        case "contact_email_invalid":
            return t("site.form.validation.emailInvalid");

        case "contact_phone_invalid":
            return t("site.form.validation.phoneInvalid");

        default:
            return t("site.form.errors.save");
    }
}

export function useSiteFormWidget(
    props?: Pick<SiteFormWidgetProps, "mode" | "siteId" | "onSaved" | "onCancel">,
): SiteFormWidgetViewModel {
    const { t, locale } = useI18nContext();

    const mode = props?.mode ?? "create";

    const form = useSiteFormModel({
        mode,
        siteId: props?.siteId ?? null,
    });

    const [submitted, setSubmitted] = useState(false);
    const [touched, setTouched] = useState<
        Partial<Record<SiteFormFieldName, boolean>>
    >({});
    const [codeEditedManually, setCodeEditedManually] = useState(false);
    const [addressLookupActivated, setAddressLookupActivated] = useState(false);

    const debouncedAddressQuery = useDebouncedValue(
        form.values.addressQuery,
        250,
    );

    const normalizedAddressQuery = normalizeText(form.values.addressQuery);
    const normalizedDebouncedAddressQuery = normalizeText(debouncedAddressQuery);

    const shouldEnableAddressLookup =
        addressLookupActivated &&
        normalizedDebouncedAddressQuery.length >= 3;

    const addressRegistryQuery = useAddressRegistrySearchQuery(
        debouncedAddressQuery,
        {
            enabled: shouldEnableAddressLookup,
            limit: 8,
            keepPreviousData: true,
        },
    );

    useEffect(() => {
        setCodeEditedManually(false);
        setAddressLookupActivated(false);
    }, [mode, props?.siteId]);

    useEffect(() => {
        if (mode !== "create") {
            return;
        }

        if (codeEditedManually) {
            return;
        }

        const nextCode = generateSiteCodeFromName(form.values.name);

        if (!nextCode || nextCode === form.values.code) {
            return;
        }

        form.setFieldValue("code", nextCode);
    }, [codeEditedManually, form, form.values.code, form.values.name, mode]);

    const visibleErrors = useMemo<SiteFormFieldErrors>(() => {
        const result: SiteFormFieldErrors = {};

        (Object.keys(form.errors) as SiteFormErrorFieldName[]).forEach((field) => {
            const errorCode = form.errors[field];

            if (!errorCode) {
                return;
            }

            if (submitted || touched[field]) {
                result[field] = translateValidationError(field, errorCode, t);
            }
        });

        return result;
    }, [form.errors, submitted, t, touched]);

    const markFieldTouched = useCallback((name: SiteFormFieldName): void => {
        setTouched((prev) =>
            prev[name]
                ? prev
                : {
                    ...prev,
                    [name]: true,
                },
        );
    }, []);

    const setFieldValue = useCallback(
        <Name extends SiteFormFieldName>(
            name: Name,
            value: SiteFormWidgetViewModel["values"][Name],
        ): void => {
            if (name === "code") {
                setCodeEditedManually(true);
            }

            if (name === "contactPhone") {
                form.setFieldValue(
                    name,
                    formatContactPhoneInput(value) as SiteFormWidgetViewModel["values"][Name],
                );
                return;
            }

            form.setFieldValue(name, value);
        },
        [form],
    );

    const regenerateCode = useCallback((): void => {
        const nextCode = generateSiteCodeFromName(form.values.name);

        setCodeEditedManually(false);
        form.setFieldValue("code", nextCode);
        markFieldTouched("code");
    }, [form, form.values.name, markFieldTouched]);

    const setAddressQuery = useCallback(
        (value: string): void => {
            const normalizedNextValue = normalizeText(value);

            form.setFieldValue("addressQuery", value);
            setAddressLookupActivated(normalizedNextValue.length >= 3);

            const selected = form.values.addressSelection;

            if (
                selected &&
                normalizeLookupToken(value, locale) !==
                normalizeLookupToken(selected.label, locale)
            ) {
                form.setFieldValue("addressSelection", null);
            }
        },
        [form, locale],
    );

    const selectAddressSuggestion = useCallback(
        (suggestion: AddressRegistryBuilding): void => {
            form.setFieldValue("addressQuery", suggestion.label);
            form.setFieldValue(
                "addressSelection",
                mapRegistryBuildingToFormSelection(suggestion),
            );
            setAddressLookupActivated(false);

            setTouched((prev) => ({
                ...prev,
                addressQuery: true,
            }));
        },
        [form],
    );

    const clearSelectedAddress = useCallback((): void => {
        form.setFieldValue("addressSelection", null);
        form.setFieldValue("addressQuery", "");
        setAddressLookupActivated(false);

        setTouched((prev) => ({
            ...prev,
            addressQuery: true,
        }));
    }, [form]);

    const reset = useCallback((): void => {
        setSubmitted(false);
        setTouched({});
        setCodeEditedManually(false);
        setAddressLookupActivated(false);
        form.reset();
    }, [form]);

    const submit = useCallback(async (): Promise<void> => {
        setSubmitted(true);

        if (!form.isValid) {
            return;
        }

        const result = await form.submit();

        if (!result?.site) {
            return;
        }

        setSubmitted(false);
        setTouched({});
        setCodeEditedManually(false);
        setAddressLookupActivated(false);
        props?.onSaved?.(result.site);
    }, [form, props]);

    const cancel = useCallback((): void => {
        props?.onCancel?.();
    }, [props]);

    const showLegacyAddressWarning = useMemo(
        () =>
            mode === "edit" &&
            siteNeedsAddressRegistryBinding(form.site) &&
            !form.values.addressSelection,
        [form.site, form.values.addressSelection, mode],
    );

    const legacyAddressText = useMemo(
        () =>
            showLegacyAddressWarning
                ? getSiteFormInitialAddressQuery(form.site)
                : null,
        [form.site, showLegacyAddressWarning],
    );

    const addressLookupLoading = useMemo(
        () =>
            addressLookupActivated &&
            normalizedAddressQuery.length >= 3 &&
            (
                addressRegistryQuery.isFetching ||
                normalizedAddressQuery !== normalizedDebouncedAddressQuery
            ),
        [
            addressLookupActivated,
            addressRegistryQuery.isFetching,
            normalizedAddressQuery,
            normalizedDebouncedAddressQuery,
        ],
    );

    return {
        mode,
        title:
            mode === "create"
                ? t("site.form.title.create")
                : t("site.form.title.edit"),
        subtitle: t("site.form.subtitleCompact"),

        values: form.values,
        errors: visibleErrors,

        isLoading: form.loading,
        isSaving: form.saving,
        isDirty: form.isDirty,
        isValid: form.isValid,

        loadError: form.error
            ? getErrorMessage(form.error, t("site.form.loadError.subtitle"))
            : null,
        saveError: form.saveError
            ? getErrorMessage(form.saveError, t("site.form.errors.save"))
            : null,

        primaryActionLabel:
            mode === "create"
                ? t("site.form.actions.create")
                : t("site.form.actions.save"),
        secondaryActionLabel: t("site.form.actions.reset"),
        cancelActionLabel: t("site.form.actions.cancel"),

        codeHelpText: t("site.form.code.compactHelp"),
        canRegenerateCode: Boolean(normalizeText(form.values.name)),

        selectedAddress: form.values.addressSelection,
        addressSuggestions: addressRegistryQuery.data ?? [],
        addressLookupActivated,
        addressLookupLoading,
        addressLookupError:
            addressLookupActivated && addressRegistryQuery.error
                ? getErrorMessage(
                    addressRegistryQuery.error,
                    t("site.form.address.lookupError"),
                )
                : null,
        showLegacyAddressWarning,
        legacyAddressText,

        setFieldValue,
        markFieldTouched,

        setAddressQuery,
        selectAddressSuggestion,
        clearSelectedAddress,
        regenerateCode,

        reset,
        submit,
        cancel,
    };
}

function mapRegistryBuildingToFormSelection(
    value: AddressRegistryBuilding,
): SiteFormWidgetViewModel["selectedAddress"] {
    return {
        source: "gar_fias",
        registryId: value.id,
        label: value.label,
        shortLabel: value.shortLabel,
        objectGuid: value.objectGuid,
        objectId: value.objectId,
        houseGuid: value.houseGuid,
        houseId: value.houseId,
        region: value.region,
        city: value.city,
        settlement: value.settlement,
        street: value.street,
        house: value.house,
        building: value.building,
        postalCode: value.postalCode,
        okato: value.okato,
        oktmo: value.oktmo,
    };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setDebounced(value);
        }, delayMs);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [delayMs, value]);

    return debounced;
}