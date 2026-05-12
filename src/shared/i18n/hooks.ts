// =====================
// File: src/shared/i18n/hooks.ts
// Purpose:
// - Main i18n React hook
// - Expose one canonical translation hook
// =====================

import { useI18nContext } from './provider';
import type {
    LocaleCode,
    TFunction,
} from './types';

export interface UseTranslationResult {
    t: TFunction;
    locale: LocaleCode;
    setLocale(locale: LocaleCode): void;
}

export const useTranslation =
    (): UseTranslationResult => {
        const { t, locale, setLocale } =
            useI18nContext();

        return {
            t,
            locale,
            setLocale,
        };
    };