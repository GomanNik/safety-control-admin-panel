// =====================
// File: src/shared/i18n/core.ts
// Purpose:
// - Shared i18n core
// - Fixed count interpolation
// - Strict unknown-locale handling for extend/load
// =====================

import type {
    FlattenedMessagesDictionary,
    I18nConfig,
    I18nInstance,
    LocaleCode,
    MessagesDictionary,
    MessagesLoader,
    PluralCategory,
    TFunction,
} from './types';
import { ruMessages } from './messages/ru';
import { enMessages } from './messages/en';

/**
 * Проверяем, является ли значение "простым" объектом.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object') {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

const normalizeLocaleCode = (locale: LocaleCode): LocaleCode =>
    String(locale).trim().toLowerCase() as LocaleCode;

/**
 * Флэттим словарь сообщений:
 *   { common: { save: 'Сохранить' } } → { 'common.save': 'Сохранить' }
 */
const flattenMessages = (
    dict: MessagesDictionary,
    prefix = '',
): FlattenedMessagesDictionary => {
    const result: FlattenedMessagesDictionary = {};
    const baseKey = prefix ? `${prefix}.` : '';

    for (const key in dict) {
        if (!Object.prototype.hasOwnProperty.call(dict, key)) {
            continue;
        }

        const value = dict[key];

        if (typeof value === 'string') {
            result[`${baseKey}${key}`] = value;
            continue;
        }

        if (isPlainObject(value)) {
            const nested = flattenMessages(
                value as unknown as MessagesDictionary,
                `${baseKey}${key}`,
            );

            for (const nestedKey in nested) {
                if (!Object.prototype.hasOwnProperty.call(nested, nestedKey)) {
                    continue;
                }

                result[nestedKey] = nested[nestedKey];
            }
        }
    }

    return result;
};

/**
 * Нормализуем список поддерживаемых локалей:
 * - гарантируем наличие defaultLocale
 * - убираем дубликаты case-insensitive
 */
const normalizeSupportedLocales = (
    defaultLocale: LocaleCode,
    supportedLocales: LocaleCode[],
): LocaleCode[] => {
    const seen: Record<string, boolean> = {};
    const result: LocaleCode[] = [];

    const all = [defaultLocale, ...supportedLocales];

    for (const rawLocale of all) {
        const locale = normalizeLocaleCode(rawLocale);
        const key = String(locale);

        if (!key || seen[key]) {
            continue;
        }

        seen[key] = true;
        result.push(locale);
    }

    return result;
};

const getLanguageCode = (locale: LocaleCode): string =>
    String(normalizeLocaleCode(locale)).split('-')[0].toLowerCase();

/**
 * Определяем категорию плюрализации для заданной локали и числа.
 */
const getPluralCategory = (
    locale: LocaleCode,
    count: number,
): PluralCategory => {
    const n = Math.abs(count);

    if (!Number.isFinite(n)) {
        return 'other';
    }

    if (n === 0) {
        return 'zero';
    }

    const lang = getLanguageCode(locale);

    switch (lang) {
        case 'ru':
        case 'uk':
        case 'be': {
            const mod10 = n % 10;
            const mod100 = n % 100;

            if (mod10 === 1 && mod100 !== 11) {
                return 'one';
            }

            if (
                mod10 >= 2 &&
                mod10 <= 4 &&
                (mod100 < 12 || mod100 > 14)
            ) {
                return 'few';
            }

            if (
                mod10 === 0 ||
                (mod10 >= 5 && mod10 <= 9) ||
                (mod100 >= 11 && mod100 <= 14)
            ) {
                return 'many';
            }

            return 'other';
        }

        case 'en':
        case 'de':
        case 'es':
        case 'fr':
        case 'it':
        case 'nl':
        case 'sv':
        case 'no':
        case 'da':
        case 'fi': {
            return n === 1 ? 'one' : 'other';
        }

        default: {
            return n === 1 ? 'one' : 'other';
        }
    }
};

class BasicI18nInstance implements I18nInstance {
    private readonly defaultLocale: LocaleCode;
    private readonly supportedLocales: LocaleCode[];
    private readonly messages: Record<LocaleCode, FlattenedMessagesDictionary>;
    private readonly pendingLoads: Map<LocaleCode, Promise<void>>;
    private currentLocale: LocaleCode;

    constructor(config: I18nConfig) {
        if (!config.defaultLocale) {
            throw new Error('[i18n] defaultLocale must be provided');
        }

        this.defaultLocale = normalizeLocaleCode(config.defaultLocale);
        this.supportedLocales = normalizeSupportedLocales(
            this.defaultLocale,
            config.supportedLocales ?? [],
        );

        if (this.supportedLocales.length === 0) {
            throw new Error('[i18n] supportedLocales must contain at least one locale');
        }

        this.messages = {} as Record<LocaleCode, FlattenedMessagesDictionary>;
        this.pendingLoads = new Map<LocaleCode, Promise<void>>();

        for (const locale of this.supportedLocales) {
            const rawMessages =
                config.messages[locale] ??
                config.messages[normalizeLocaleCode(locale)] ??
                {};

            this.messages[locale] = flattenMessages(rawMessages);
        }

        this.currentLocale = this.resolveLocale(this.defaultLocale);
    }

    private findSupportedLocale(locale: LocaleCode): LocaleCode | undefined {
        const normalized = normalizeLocaleCode(locale);

        if (this.supportedLocales.indexOf(normalized) !== -1) {
            return normalized;
        }

        const short = normalized.split('-')[0] as LocaleCode;

        if (short && this.supportedLocales.indexOf(short) !== -1) {
            return short;
        }

        return undefined;
    }

    private resolveLocale(locale: LocaleCode): LocaleCode {
        return this.findSupportedLocale(locale) ?? this.defaultLocale;
    }

    private assertSupportedLocale(locale: LocaleCode): LocaleCode {
        const resolved = this.findSupportedLocale(locale);

        if (!resolved) {
            throw new Error(`[i18n] Unsupported locale: ${String(locale)}`);
        }

        return resolved;
    }

    private resolveTemplate(
        key: string,
        locale: LocaleCode,
    ): string | undefined {
        const resolvedLocale = this.resolveLocale(locale);

        const messagesCurrent = this.messages[resolvedLocale] ?? {};
        const messagesFallback =
            resolvedLocale === this.defaultLocale
                ? messagesCurrent
                : this.messages[this.defaultLocale] ?? {};

        if (Object.prototype.hasOwnProperty.call(messagesCurrent, key)) {
            return messagesCurrent[key];
        }

        if (
            messagesFallback !== messagesCurrent &&
            Object.prototype.hasOwnProperty.call(messagesFallback, key)
        ) {
            return messagesFallback[key];
        }

        return undefined;
    }

    public getLocale(): LocaleCode {
        return this.currentLocale;
    }

    public setLocale(locale: LocaleCode): void {
        this.currentLocale = this.resolveLocale(locale);
    }

    public getSupportedLocales(): LocaleCode[] {
        return [...this.supportedLocales];
    }

    public extendMessages(
        locale: LocaleCode,
        messages: MessagesDictionary,
    ): void {
        const resolvedLocale = this.assertSupportedLocale(locale);
        const existing = this.messages[resolvedLocale] ?? {};
        const flattened = flattenMessages(messages);

        this.messages[resolvedLocale] = {
            ...existing,
            ...flattened,
        };
    }

    public loadMessages(
        locale: LocaleCode,
        loader: MessagesLoader,
    ): Promise<void> {
        const resolvedLocale = this.assertSupportedLocale(locale);

        const existingPromise = this.pendingLoads.get(resolvedLocale);
        if (existingPromise) {
            return existingPromise;
        }

        const promise = loader()
            .then(messages => {
                if (messages && typeof messages === 'object') {
                    this.extendMessages(resolvedLocale, messages);
                }
            })
            .finally(() => {
                this.pendingLoads.delete(resolvedLocale);
            });

        this.pendingLoads.set(resolvedLocale, promise);
        return promise;
    }

    public t: TFunction = (key, options) => {
        const safeKey = String(key || '').trim();

        if (!safeKey) {
            return options?.defaultValue ?? '';
        }

        const locale = this.currentLocale;
        let template: string | undefined;

        const count = options?.count;
        const hasCount =
            typeof count === 'number' && Number.isFinite(count);

        if (hasCount) {
            const category = getPluralCategory(locale, count as number);
            const candidates: string[] = [
                `${safeKey}.${category}`,
            ];

            if (category !== 'other') {
                candidates.push(`${safeKey}.other`);
            }

            candidates.push(safeKey);

            for (const candidate of candidates) {
                template = this.resolveTemplate(candidate, locale);

                if (template !== undefined) {
                    break;
                }
            }
        } else {
            template = this.resolveTemplate(safeKey, locale);
        }

        if (template === undefined) {
            template = options?.defaultValue ?? safeKey;
        }

        if (!options) {
            return template;
        }

        return this.interpolate(template, options);
    };

    private interpolate(
        template: string,
        options: Record<string, unknown>,
    ): string {
        let result = template;

        for (const key in options) {
            if (!Object.prototype.hasOwnProperty.call(options, key)) {
                continue;
            }

            if (key === 'defaultValue') {
                continue;
            }

            const value = options[key];

            if (value === undefined || value === null) {
                continue;
            }

            const placeholder = `{{${key}}}`;
            let index = result.indexOf(placeholder);

            if (index === -1) {
                continue;
            }

            const replacement = String(value);

            while (index !== -1) {
                result =
                    result.slice(0, index) +
                    replacement +
                    result.slice(index + placeholder.length);

                index = result.indexOf(
                    placeholder,
                    index + replacement.length,
                );
            }
        }

        return result;
    }
}

const defaultI18nConfig: I18nConfig = {
    defaultLocale: 'ru',
    supportedLocales: ['ru', 'en'],
    messages: {
        ru: ruMessages,
        en: enMessages,
    },
};

export const i18n: I18nInstance = new BasicI18nInstance(defaultI18nConfig);

export const t: TFunction = (key, options) => i18n.t(key, options);

export const getCurrentLocale = (): LocaleCode => i18n.getLocale();