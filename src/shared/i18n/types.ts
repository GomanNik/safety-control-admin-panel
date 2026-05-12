// =====================
// shared/i18n/types.ts
// =====================

export type LocaleCode = string;

export interface MessagesDictionary {
    [key: string]: string | MessagesDictionary;
}

export interface FlattenedMessagesDictionary {
    [key: string]: string;
}

/**
 * Категории плюрализации в стиле CLDR.
 * Реальные правила зависят от языка и реализованы в core.
 */
export type PluralCategory =
    | 'zero'
    | 'one'
    | 'two'
    | 'few'
    | 'many'
    | 'other';

export interface I18nConfig {
    defaultLocale: LocaleCode;
    supportedLocales: LocaleCode[];
    messages: Record<LocaleCode, MessagesDictionary>;
}

/**
 * Параметры функции перевода.
 *
 * count:
 *   - если передан, используется для выбора формы множественного числа
 *     по языковым правилам (ru, en и дефолт для остальных).
 *   - шаблоны для плюрализации задаются через ключи вида:
 *       "incidents.one", "incidents.few", "incidents.many", "incidents.other"
 *     тогда вызов t('incidents', { count: 3 }) выберет нужный вариант.
 *
 * defaultValue:
 *   - значение по умолчанию, если ключ не найден ни в текущей локали,
 *     ни в fallback-локали.
 *
 * остальные поля:
 *   - используются для интерполяции плейсхолдеров {{name}} в строке.
 */
export interface TOptions {
    defaultValue?: string;
    count?: number;
    [key: string]: unknown;
}

export type TFunction = (key: string, options?: TOptions) => string;

/**
 * Лоадер сообщений для ленивой загрузки словаря локали.
 * Обычно реализуется через dynamic import:
 *
 *   () => import('./messages/ru.json').then(m => m.default)
 */
export type MessagesLoader = () => Promise<MessagesDictionary>;

export interface I18nInstance {
    getLocale(): LocaleCode;
    setLocale(locale: LocaleCode): void;
    t: TFunction;
    getSupportedLocales(): LocaleCode[];

    /**
     * Расширяет словарь сообщений для указанной локали.
     * Новые ключи добавляются поверх существующих.
     */
    extendMessages(locale: LocaleCode, messages: MessagesDictionary): void;

    /**
     * Опциональная поддержка ленивой загрузки словарей.
     *
     * Реализация может кешировать результат и вызывать loader
     * только один раз для каждой локали.
     */
    loadMessages?(
        locale: LocaleCode,
        loader: MessagesLoader,
    ): Promise<void>;
}
