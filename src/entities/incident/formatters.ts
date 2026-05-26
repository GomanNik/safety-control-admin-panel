// =====================
// entities/incident/formatters.ts
// =====================

import {
    t as sharedT,
    getCurrentLocale,
    type TFunction,
    type LocaleCode,
} from '../../shared/i18n';
import { getGlobalLogger } from '../../shared/logging';

import {
    IncidentSeverity,
    IncidentType,
    IncidentDataQualityStatus,
} from './types';

import {
    getIncidentSeverityI18nKey,
    getIncidentTypeI18nKey,
    getIncidentDataQualityStatusI18nKey,
} from './model';

const logger = getGlobalLogger()
    .child('entities')
    .child('incident')
    .child('formatters');

const loggedMissingOptionsKeys = new Set<string>();
const SECOND_MS = 1000;

export interface IncidentFormatterOptions {
    t?: TFunction;
    locale?: LocaleCode;
    dateTimeFormatOptions?: Intl.DateTimeFormatOptions;
    emptyDateValue?: string;
}

const safePreview = (
    value: unknown,
    maxLen: number = 64,
): string => {
    const normalized = String(value ?? '');

    if (normalized.length <= maxLen) {
        return normalized;
    }

    return `${normalized.slice(0, maxLen)}…`;
};

function asLowerString(
    value: unknown,
): string {
    if (value == null) {
        return '';
    }

    return String(value).trim().toLowerCase();
}

function resolveT(
    options?: IncidentFormatterOptions,
): TFunction {
    return options?.t ?? sharedT;
}

function resolveLocale(
    options?: IncidentFormatterOptions,
): LocaleCode {
    return options?.locale ?? getCurrentLocale();
}

function warnMissingI18nOptions(
    formatterName: string,
    options?: IncidentFormatterOptions,
): void {
    const missingT = typeof options?.t !== 'function';
    const missingLocale = !options?.locale;

    if (!missingT && !missingLocale) {
        return;
    }

    const key =
        `${formatterName}|missingT:${String(missingT)}|missingLocale:${String(missingLocale)}`;

    if (loggedMissingOptionsKeys.has(key)) {
        return;
    }

    loggedMissingOptionsKeys.add(key);

    logger.warn(
        'incident formatter called without explicit i18n options; using shared singleton fallback',
        {
            formatterName,
            missingT,
            missingLocale,
            resolvedLocale: resolveLocale(options),
            fallbackSource: 'shared/i18n singleton',
        },
    );
}

function formatUnknown(
    options?: IncidentFormatterOptions,
): string {
    const t = resolveT(options);

    return t('common.unknown', {
        defaultValue: 'Unknown',
    });
}

function formatNotAvailable(
    options?: IncidentFormatterOptions,
): string {
    const t = resolveT(options);

    return options?.emptyDateValue ?? t('common.notAvailable', {
        defaultValue: '—',
    });
}

function formatDateLocale(
    date: Date,
    locale: LocaleCode,
    options?: Intl.DateTimeFormatOptions,
): string {
    try {
        return date.toLocaleString(locale, options);
    } catch {
        return date.toLocaleString();
    }
}

function isEnumValue<T extends Record<string, string>>(
    enumObj: T,
    valueLower: string,
): valueLower is T[keyof T] {
    return (Object.values(enumObj) as string[]).includes(valueLower);
}

export function formatIncidentDateTime(
    value: unknown,
    options?: IncidentFormatterOptions,
): string {
    warnMissingI18nOptions('formatIncidentDateTime', options);

    const locale = resolveLocale(options);
    const empty = formatNotAvailable(options);
    const dateOptions = options?.dateTimeFormatOptions;

    if (value == null) {
        return empty;
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            logger.warn('incident formatter: invalid Date instance', {
                value: safePreview(value),
                locale,
            });

            return empty;
        }

        return formatDateLocale(value, locale, dateOptions);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();

        if (!trimmed) {
            return empty;
        }

        const parsed = new Date(trimmed);

        if (Number.isNaN(parsed.getTime())) {
            const looksLikeDate =
                /^\d{4}-\d{2}-\d{2}/.test(trimmed)
                || trimmed.includes('T');

            if (looksLikeDate) {
                logger.warn('incident formatter: unparseable datetime string', {
                    value: safePreview(trimmed),
                    locale,
                });
            }

            return trimmed;
        }

        return formatDateLocale(parsed, locale, dateOptions);
    }

    if (typeof value === 'number') {
        const milliseconds = value < 1e12
            ? value * SECOND_MS
            : value;
        const parsed = new Date(milliseconds);

        if (Number.isNaN(parsed.getTime())) {
            logger.warn('incident formatter: invalid numeric datetime', {
                value,
                locale,
            });

            return empty;
        }

        return formatDateLocale(parsed, locale, dateOptions);
    }

    return empty;
}

export function formatIncidentSeverity(
    severity: unknown,
    options?: IncidentFormatterOptions,
): string {
    warnMissingI18nOptions('formatIncidentSeverity', options);

    const t = resolveT(options);
    const normalized = asLowerString(severity);

    if (!normalized) {
        return formatUnknown(options);
    }

    if (isEnumValue(IncidentSeverity, normalized)) {
        return t(getIncidentSeverityI18nKey(normalized as IncidentSeverity), {
            defaultValue: String(severity ?? ''),
        });
    }

    return formatUnknown(options);
}

export function formatIncidentType(
    type: unknown,
    options?: IncidentFormatterOptions,
): string {
    warnMissingI18nOptions('formatIncidentType', options);

    const t = resolveT(options);
    const normalized = asLowerString(type);

    if (!normalized) {
        return formatUnknown(options);
    }

    if (isEnumValue(IncidentType, normalized)) {
        return t(getIncidentTypeI18nKey(normalized as IncidentType), {
            defaultValue: String(type ?? ''),
        });
    }

    return formatUnknown(options);
}

export function formatIncidentDataQualityStatus(
    value: unknown,
    options?: IncidentFormatterOptions,
): string {
    warnMissingI18nOptions('formatIncidentDataQualityStatus', options);

    const t = resolveT(options);
    const normalized = asLowerString(value);

    if (!normalized) {
        return formatUnknown(options);
    }

    if (isEnumValue(IncidentDataQualityStatus, normalized)) {
        return t(
            getIncidentDataQualityStatusI18nKey(
                normalized as IncidentDataQualityStatus,
            ),
            {
                defaultValue: String(value ?? ''),
            },
        );
    }

    return formatUnknown(options);
}