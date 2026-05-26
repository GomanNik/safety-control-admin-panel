// =====================
// src/widgets/settings/SettingsWorkspaceWidget/SettingsWorkspaceWidget.tsx
// =====================

import type { JSX } from 'react';

import { useTranslation } from '../../../shared/i18n';

import { useSettingsWorkspaceWidget } from './model/useSettingsWorkspaceWidget';
import { SettingsGeneralSection } from './ui/SettingsGeneralSection';

import './SettingsWorkspaceWidget.css';

export function SettingsWorkspaceWidget(): JSX.Element {
    const { t } = useTranslation();
    const model = useSettingsWorkspaceWidget();

    return (
        <section className="settings-workspace-widget app-container">
            <header className="settings-workspace-widget__header">
                <h1 className="settings-workspace-widget__title">
                    {t('settings.title')}
                </h1>
            </header>

            <SettingsGeneralSection
                {...model.generalSection}
            />
        </section>
    );
}