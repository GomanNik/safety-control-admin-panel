// =====================
// src/widgets/incidents/IncidentsWorkspaceWidget/ui/IncidentMetricsSection.tsx
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import {
    Button,
    Card,
    Grid,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';

import type { IncidentsWorkspaceMetricsSectionView } from '../types';

interface IncidentMetricsSectionProps {
    title: string;
    subtitle?: string;
    view: IncidentsWorkspaceMetricsSectionView;
}

export function IncidentMetricsSection(
    props: IncidentMetricsSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        view,
    } = props;

    const { t } = useI18nContext();

    return (
        <Card
            variant="default"
            padding="md"
            header={(
                <Stack gap={6}>
                    <Heading level={3}>
                        {title}
                    </Heading>

                    {subtitle ? (
                        <Text variant="muted">
                            {subtitle}
                        </Text>
                    ) : null}
                </Stack>
            )}
        >
            {view.isLoading ? (
                <Text>
                    {t('incidents.workspace.metrics.loading')}
                </Text>
            ) : view.isError ? (
                <Stack gap={12}>
                    <Text variant="danger">
                        {t('incidents.workspace.metrics.error')}
                    </Text>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={view.onRetry}
                    >
                        {t('incidents.workspace.common.retry')}
                    </Button>
                </Stack>
            ) : view.summary ? (
                <Stack gap={16}>
                    <Grid
                        columns="auto-fit"
                        minColumnWidth={160}
                        gap={12}
                    >
                        <Card
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={6}>
                                <Text variant="caption">
                                    {t('incidents.workspace.metrics.cards.total')}
                                </Text>

                                <Heading level={3}>
                                    {view.summary.totalCount}
                                </Heading>
                            </Stack>
                        </Card>

                        <Card
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={6}>
                                <Text variant="caption">
                                    {t('incidents.workspace.metrics.cards.critical')}
                                </Text>

                                <Heading level={3}>
                                    {view.summary.criticalCount}
                                </Heading>
                            </Stack>
                        </Card>
                    </Grid>

                    <Grid
                        columns={2}
                        gap={12}
                    >
                        <Card
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={8}>
                                <Text variant="caption">
                                    {t('incidents.workspace.metrics.topSites.title')}
                                </Text>

                                {view.summary.topSites.length === 0 ? (
                                    <Text variant="muted">
                                        {t('incidents.workspace.metrics.topSites.empty')}
                                    </Text>
                                ) : (
                                    view.summary.topSites.map((bucket) => (
                                        <Text
                                            key={bucket.siteId}
                                            as="span"
                                        >
                                            {bucket.siteId}: {bucket.count}
                                        </Text>
                                    ))
                                )}
                            </Stack>
                        </Card>

                        <Card
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={8}>
                                <Text variant="caption">
                                    {t('incidents.workspace.metrics.topCameras.title')}
                                </Text>

                                {view.summary.topCameras.length === 0 ? (
                                    <Text variant="muted">
                                        {t('incidents.workspace.metrics.topCameras.empty')}
                                    </Text>
                                ) : (
                                    view.summary.topCameras.map((bucket) => (
                                        <Text
                                            key={bucket.cameraId}
                                            as="span"
                                        >
                                            {bucket.cameraId}: {bucket.count}
                                        </Text>
                                    ))
                                )}
                            </Stack>
                        </Card>
                    </Grid>
                </Stack>
            ) : (
                <Text variant="muted">
                    {t('incidents.workspace.metrics.empty')}
                </Text>
            )}
        </Card>
    );
}