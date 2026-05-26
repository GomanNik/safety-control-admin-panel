// =====================
// File: src/features/site/site-form/validation.ts
// Purpose:
// - Validation for unified site form
// - Returns error codes only
// - Address can be selected only from official registry
// =====================

import type {
    SiteFormValidationContext,
    SiteFormValidationResult,
    SiteFormValues,
} from './types';

import {
    getSiteFormInitialAddressQuery,
    normalizeSiteFormValues,
} from './mappers';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_RE = /^\+?[0-9()\-\s]{7,20}$/;
const CODE_RE = /^[A-Z0-9](?:[A-Z0-9_-]{1,31})?$/;
const SITE_NAME_RE = /^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9\s().,'"\-–—/№#]{2,119}$/u;
const PERSON_RE = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s.'\-–—]{1,119}$/u;

const hasText = (
    value: unknown,
): boolean => String(value ?? '').trim().length > 0;

const hasContact = (
    values: SiteFormValues,
): boolean => (
    hasText(values.contactName) ||
    hasText(values.contactEmail) ||
    hasText(values.contactPhone) ||
    hasText(values.contactPosition)
);

const countDigits = (
    value: string,
): number => value.replace(/\D/g, '').length;

function shouldRequireOfficialAddressSelection(
    values: SiteFormValues,
    context: SiteFormValidationContext,
): boolean {
    if (values.addressSelection) {
        return false;
    }

    if (context.mode === 'create') {
        return true;
    }

    const originalSite = context.originalSite ?? null;

    if (!originalSite) {
        return true;
    }

    const initialAddressQuery = getSiteFormInitialAddressQuery(
        originalSite,
    );

    if (!initialAddressQuery) {
        return true;
    }

    return values.addressQuery !== initialAddressQuery;
}

export const validateSiteForm = (
    input: SiteFormValues,
    context: SiteFormValidationContext,
): SiteFormValidationResult => {
    const values = normalizeSiteFormValues(input);
    const errors: SiteFormValidationResult['errors'] = {};

    if (!values.name) {
        errors.name = 'required';
    } else if (
        values.name.length < 3 ||
        values.name.length > 120 ||
        !SITE_NAME_RE.test(values.name)
    ) {
        errors.name = 'invalid_name';
    }

    if (values.code && !CODE_RE.test(values.code)) {
        errors.code = 'invalid_code';
    }

    if (shouldRequireOfficialAddressSelection(values, context)) {
        errors.addressQuery = 'address_required';
    }

    if (hasContact(values)) {
        if (!values.contactName) {
            errors.contactName = 'contact_name_required';
        } else if (!PERSON_RE.test(values.contactName)) {
            errors.contactName = 'contact_name_invalid';
        }

        if (!values.contactEmail && !values.contactPhone) {
            errors.contactPhone = 'contact_channel_required';
        }

        if (
            values.contactEmail &&
            !EMAIL_RE.test(values.contactEmail)
        ) {
            errors.contactEmail = 'contact_email_invalid';
        }

        if (
            values.contactPhone &&
            (
                !PHONE_RE.test(values.contactPhone) ||
                countDigits(values.contactPhone) < 7
            )
        ) {
            errors.contactPhone = 'contact_phone_invalid';
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        values,
        errors,
    };
}