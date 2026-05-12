// =====================
// src/pages/SettingsPage/index.tsx
// =====================

import type { JSX } from 'react';

import { AppLayout } from '../../app/layout';
import { SettingsWorkspaceWidget } from '../../widgets';

export function SettingsPage(): JSX.Element {
    return (
        <AppLayout>
            <SettingsWorkspaceWidget />
        </AppLayout>
    );
}