// =====================
// src/widgets/settings/SettingsWorkspaceWidget/ui/SettingsGeneralSection.tsx
// =====================

import type {
    ChangeEvent,
    JSX,
} from 'react';

import {
    Button,
    Card,
    FormField,
    Grid,
    Select,
    Stack,
    Text,
} from '../../../../shared/ui';
import { useTranslation } from '../../../../shared/i18n';

import type { SettingsGeneralSectionProps } from '../types';

export function SettingsGeneralSection(
    props: SettingsGeneralSectionProps,
): JSX.Element {
    const {
        locale,
        localeOptions,
        onLocaleChange,
        themeMode,
        themeModeOptions,
        onThemeModeChange,
        onResetPreferences,
        isBusy,
    } = props;

    const { t } = useTranslation();

    const handleLocaleSelect = (
        event: ChangeEvent<HTMLSelectElement>,
    ): void => {
        onLocaleChange(event.target.value);
    };

    const handleThemeModeSelect = (
        event: ChangeEvent<HTMLSelectElement>,
    ): void => {
        onThemeModeChange(event.target.value as typeof themeMode);
    };

    return (
        <Card
            variant="elevated"
            padding="lg"
            className="settings-workspace-widget__section-card"
            header={(
                <div className="settings-workspace-widget__section-header">
                    <Text className="settings-workspace-widget__section-title">
                        {t('settings.general.title')}
                    </Text>
                </div>
            )}
            footer={(
                <div className="settings-workspace-widget__section-footer">
                    <Button
                        variant="secondary"
                        onClick={onResetPreferences}
                        disabled={isBusy}
                    >
                        {t('settings.actions.reset')}
                    </Button>
                </div>
            )}
        >
            <Stack
                gap={20}
                className="settings-workspace-widget__section-content"
            >
                <Grid
                    columns="auto-fit"
                    minColumnWidth={280}
                    gap={16}
                >
                    <FormField
                        label={t('settings.fields.languageLabel')}
                    >
                        <Select
                            value={locale}
                            options={localeOptions}
                            onChange={handleLocaleSelect}
                            disabled={isBusy}
                        />
                    </FormField>

                    <FormField
                        label={t('settings.fields.themeModeLabel')}
                    >
                        <Select
                            value={themeMode}
                            options={themeModeOptions}
                            onChange={handleThemeModeSelect}
                            disabled={isBusy}
                        />
                    </FormField>
                </Grid>
            </Stack>
        </Card>
    );
}