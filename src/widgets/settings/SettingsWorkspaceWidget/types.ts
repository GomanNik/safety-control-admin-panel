// =====================
// src/widgets/settings/SettingsWorkspaceWidget/types.ts
// =====================

import type { LocaleCode } from '../../../shared/i18n';
import type { ThemeMode } from '../../../shared/theme';

export interface SettingsWorkspaceSelectOption<TValue extends string = string> {
    value: TValue;
    label: string;
}

export interface SettingsGeneralSectionProps {
    locale: LocaleCode;
    localeOptions: ReadonlyArray<SettingsWorkspaceSelectOption<LocaleCode>>;
    onLocaleChange(locale: LocaleCode): void;

    themeMode: ThemeMode;
    themeModeOptions: ReadonlyArray<SettingsWorkspaceSelectOption<ThemeMode>>;
    onThemeModeChange(mode: ThemeMode): void;

    onResetPreferences(): void;
    isBusy?: boolean;
}

export interface SettingsWorkspaceWidgetModel {
    generalSection: SettingsGeneralSectionProps;
}