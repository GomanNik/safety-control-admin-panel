// =====================
// src/shared/i18n/provider.ts
// =====================

import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type {
    ReactElement,
    ReactNode,
} from 'react';
import type {
    I18nInstance,
    LocaleCode,
    TFunction,
} from './types';
import { I18N_STORAGE_KEY } from './constants';
import {
    getCurrentLocale,
    i18n as globalI18n,
} from './core';
import { getGlobalLogger } from '../logging';

export interface I18nProviderProps {
    instance: I18nInstance;
    children: ReactNode;
}

export interface I18nContextValue {
    locale: LocaleCode;
    setLocale(locale: LocaleCode): void;
    t: TFunction;
    instance: I18nInstance;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const logger = getGlobalLogger()
    .child('shared')
    .child('i18n')
    .child('provider');

const loggedInitKeys = new Set<string>();
const logInitOnce = (
    key: string,
    meta?: Record<string, unknown>,
): void => {
    if (loggedInitKeys.has(key)) {
        return;
    }

    loggedInitKeys.add(key);
    logger.info('i18n init', meta);
};

const loggedWarnKeys = new Set<string>();
const warnOnce = (
    key: string,
    message: string,
    meta?: Record<string, unknown>,
): void => {
    if (loggedWarnKeys.has(key)) {
        return;
    }

    loggedWarnKeys.add(key);
    logger.warn(message, meta);
};

export const I18nProvider = (
    props: I18nProviderProps,
): ReactElement => {
    const { instance, children } = props;

    const [locale, setLocaleState] = useState<LocaleCode>(() =>
        instance.getLocale(),
    );

    /**
     * Важно:
     * пока не завершили init из storage/instance,
     * нельзя писать locale обратно в storage,
     * иначе первый render со старым state успевает перетереть app_locale.
     */
    const [isInitialized, setIsInitialized] = useState(false);

    const prevLocaleRef = useRef<LocaleCode>(locale);

    useEffect(() => {
        if (instance === globalI18n) {
            return;
        }

        warnOnce(
            'non-global-instance',
            'I18nProvider received non-global instance',
            {
                instanceLocale: instance.getLocale(),
                globalLocale: globalI18n.getLocale(),
                recommendation: 'Use shared/i18n/core.ts singleton instance',
            },
        );
    }, [instance]);

    useEffect(() => {
        try {
            if (typeof window === 'undefined') {
                const normalized = instance.getLocale();

                setLocaleState((prev) =>
                    prev === normalized ? prev : normalized,
                );

                logInitOnce('no-window', {
                    source: 'instance',
                    normalized,
                    instanceLocale: instance.getLocale(),
                    globalLocale: getCurrentLocale(),
                    instanceIsGlobal: instance === globalI18n,
                });

                setIsInitialized(true);
                return;
            }

            const storage = window.localStorage;
            let requestedLocale: LocaleCode | undefined;
            let source: 'storage' | 'instance' = 'instance';

            if (storage) {
                const stored = storage.getItem(I18N_STORAGE_KEY);

                if (stored) {
                    requestedLocale = stored as LocaleCode;
                    source = 'storage';
                }
            }

            const beforeInstanceLocale = instance.getLocale();
            const beforeGlobalLocale = getCurrentLocale();

            if (requestedLocale) {
                instance.setLocale(requestedLocale);
            }

            const normalized = instance.getLocale();

            setLocaleState((prev) =>
                prev === normalized ? prev : normalized,
            );

            logInitOnce(
                `init|${source}|${String(requestedLocale ?? normalized)}|${normalized}`,
                {
                    source,
                    requested: requestedLocale,
                    normalized,
                    beforeInstanceLocale,
                    beforeGlobalLocale,
                    afterInstanceLocale: instance.getLocale(),
                    afterGlobalLocale: getCurrentLocale(),
                    instanceIsGlobal: instance === globalI18n,
                },
            );

            setIsInitialized(true);
        } catch (err) {
            warnOnce('init-failed', 'i18n init failed', { err });
            setIsInitialized(true);
        }
    }, [instance]);

    useEffect(() => {
        if (!isInitialized || typeof window === 'undefined') {
            return;
        }

        const handleStorage = (
            event: StorageEvent,
        ): void => {
            if (event.key !== I18N_STORAGE_KEY) {
                return;
            }

            const nextRaw = event.newValue;

            if (!nextRaw) {
                return;
            }

            try {
                const beforeInstanceLocale = instance.getLocale();
                const beforeGlobalLocale = getCurrentLocale();

                instance.setLocale(nextRaw as LocaleCode);

                const normalized = instance.getLocale();

                logger.info('i18n locale synced from storage', {
                    requested: nextRaw,
                    normalized,
                    beforeInstanceLocale,
                    beforeGlobalLocale,
                    afterInstanceLocale: instance.getLocale(),
                    afterGlobalLocale: getCurrentLocale(),
                    instanceIsGlobal: instance === globalI18n,
                });

                setLocaleState((prev) =>
                    prev === normalized ? prev : normalized,
                );
            } catch (err) {
                warnOnce(
                    `storage-sync-failed|${String(nextRaw)}`,
                    'i18n storage sync failed',
                    {
                        locale: nextRaw,
                        err,
                    },
                );
            }
        };

        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener('storage', handleStorage);
        };
    }, [instance, isInitialized]);

    useEffect(() => {
        if (!isInitialized) {
            return;
        }

        const prev = prevLocaleRef.current;

        if (prev !== locale) {
            logger.info('i18n locale changed', {
                from: prev,
                to: locale,
                instanceLocale: instance.getLocale(),
                globalLocale: getCurrentLocale(),
                instanceIsGlobal: instance === globalI18n,
            });
            prevLocaleRef.current = locale;
        }

        try {
            if (typeof window !== 'undefined') {
                const storage = window.localStorage;

                if (storage) {
                    storage.setItem(I18N_STORAGE_KEY, String(locale));
                }
            }
        } catch (err) {
            warnOnce(
                'storage-write-failed',
                'i18n storage write failed',
                { err },
            );
        }
    }, [locale, instance, isInitialized]);

    useEffect(() => {
        if (!isInitialized) {
            return;
        }

        logger.info('i18n context snapshot', {
            contextLocale: locale,
            instanceLocale: instance.getLocale(),
            globalLocale: getCurrentLocale(),
            instanceIsGlobal: instance === globalI18n,
        });
    }, [locale, instance, isInitialized]);

    const setLocale = useCallback(
        (next: LocaleCode): void => {
            try {
                const beforeInstanceLocale = instance.getLocale();
                const beforeGlobalLocale = getCurrentLocale();

                instance.setLocale(next);

                const normalized = instance.getLocale();

                logger.info('i18n setLocale requested', {
                    requested: next,
                    normalized,
                    beforeInstanceLocale,
                    beforeGlobalLocale,
                    afterInstanceLocale: instance.getLocale(),
                    afterGlobalLocale: getCurrentLocale(),
                    instanceIsGlobal: instance === globalI18n,
                });

                setLocaleState((prev) =>
                    prev === normalized ? prev : normalized,
                );
            } catch (err) {
                warnOnce(
                    `setLocale-failed|${String(next)}`,
                    'i18n instance.setLocale failed',
                    { locale: next, err },
                );
            }
        },
        [instance],
    );

    /**
     * Важно:
     * t должен менять ссылку при смене locale.
     * Тогда useMemo/useCallback с зависимостью [t]
     * автоматически пересчитаются при переключении языка.
     */
    const translate = useCallback<TFunction>(
        (key, options) => instance.t(key, options),
        [instance, locale],
    );

    const value = useMemo<I18nContextValue>(
        () => ({
            locale,
            setLocale,
            t: translate,
            instance,
        }),
        [locale, setLocale, translate, instance],
    );

    return createElement(
        I18nContext.Provider,
        { value },
        children,
    );
};

export const useI18nContext = (): I18nContextValue => {
    const ctx = useContext(I18nContext);

    if (!ctx) {
        throw new Error(
            'useI18nContext must be used within I18nProvider',
        );
    }

    return ctx;
};