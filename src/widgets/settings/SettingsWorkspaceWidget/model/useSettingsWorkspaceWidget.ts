// =====================
// src/widgets/settings/SettingsWorkspaceWidget/model/useSettingsWorkspaceWidget.ts
// =====================

import {
    useCallback,
    useMemo,
} from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import type { LocaleCode } from '../../../../shared/i18n';
import type { ThemeMode } from '../../../../shared/theme';
import { useTheme } from '../../../../shared/theme';

import {
    DEFAULT_SETTINGS_LOCALE,
    DEFAULT_SETTINGS_THEME_MODE,
} from '../hooks';
import type {
    SettingsWorkspaceSelectOption,
    SettingsWorkspaceWidgetModel,
} from '../types';

export const useSettingsWorkspaceWidget =
    (): SettingsWorkspaceWidgetModel => {
        const {
            locale,
            setLocale,
            instance,
            t,
        } = useI18nContext();

        const {
            mode,
            setMode,
        } = useTheme();

        const localeOptions = useMemo<
            ReadonlyArray<SettingsWorkspaceSelectOption<LocaleCode>>
        >(
            () =>
                instance.getSupportedLocales().map((item) => ({
                    value: item,
                    label: t(`settings.locale.${item}`, {
                        defaultValue: String(item).toUpperCase(),
                    }),
                })),
            [instance, locale, t],
        );

        const themeModeOptions = useMemo<
            ReadonlyArray<SettingsWorkspaceSelectOption<ThemeMode>>
        >(
            () => [
                {
                    value: 'light',
                    label: t('settings.themeMode.light'),
                },
                {
                    value: 'dark',
                    label: t('settings.themeMode.dark'),
                },
                {
                    value: 'system',
                    label: t('settings.themeMode.system'),
                },
            ],
            [locale, t],
        );

        const handleLocaleChange = useCallback(
            (nextLocale: LocaleCode): void => {
                setLocale(nextLocale);
            },
            [setLocale],
        );

        const handleThemeModeChange = useCallback(
            (nextMode: ThemeMode): void => {
                setMode(nextMode);
            },
            [setMode],
        );

        const handleResetPreferences = useCallback(
            (): void => {
                setLocale(DEFAULT_SETTINGS_LOCALE);
                setMode(DEFAULT_SETTINGS_THEME_MODE);
            },
            [setLocale, setMode],
        );

        return {
            generalSection: {
                locale,
                localeOptions,
                onLocaleChange: handleLocaleChange,
                themeMode: mode,
                themeModeOptions,
                onThemeModeChange: handleThemeModeChange,
                onResetPreferences: handleResetPreferences,
                isBusy: false,
            },
        };
    };