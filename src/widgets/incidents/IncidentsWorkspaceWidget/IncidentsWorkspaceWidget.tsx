// =====================
// src/widgets/incidents/IncidentsWorkspaceWidget/IncidentsWorkspaceWidget.tsx
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../shared/i18n';
import {
    Heading,
    Stack,
    Text,
} from '../../../shared/ui';

import { useIncidentsWorkspaceWidget } from './hooks';
import type { IncidentsWorkspaceWidgetProps } from './types';
import { IncidentFiltersSection } from './ui/IncidentFiltersSection';
import { IncidentMetricsSection } from './ui/IncidentMetricsSection';
import { IncidentTableSection } from './ui/IncidentTableSection';

export function IncidentsWorkspaceWidget(
    props: IncidentsWorkspaceWidgetProps,
): JSX.Element {
    const {
        onOpenIncident,
        className,
        ...rest
    } = props;

    const { t } = useI18nContext();

    const viewModel = useIncidentsWorkspaceWidget({
        onOpenIncident,
    });

    return (
        <Stack
            className={className}
            gap={20}
            {...rest}
        >
            <Stack gap={6}>
                <Heading level={2}>
                    {viewModel.title}
                </Heading>

                <Text variant="muted">
                    {viewModel.subtitle}
                </Text>
            </Stack>

            <IncidentFiltersSection
                title={t('incidents.workspace.filters.title')}
                subtitle={t('incidents.workspace.filters.subtitle')}
                view={viewModel.filters}
            />

            <IncidentMetricsSection
                title={t('incidents.workspace.metrics.title')}
                subtitle={t('incidents.workspace.metrics.subtitle')}
                view={viewModel.metrics}
            />

            <IncidentTableSection
                title={t('incidents.workspace.table.title')}
                subtitle={t('incidents.workspace.table.subtitle')}
                view={viewModel.table}
            />
        </Stack>
    );
}