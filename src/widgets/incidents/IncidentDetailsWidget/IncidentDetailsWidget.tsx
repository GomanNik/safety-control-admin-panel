// =====================
// src/widgets/incidents/IncidentDetailsWidget/IncidentDetailsWidget.tsx
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../shared/i18n';
import {
    Button,
    Card,
    Grid,
    Heading,
    Stack,
    Text,
} from '../../../shared/ui';

import { useIncidentDetailsWidget } from './hooks';
import type { IncidentDetailsWidgetProps } from './types';
import { IncidentMediaSection } from './ui/IncidentMediaSection';
import { IncidentMetaSection } from './ui/IncidentMetaSection';
import { IncidentOverviewSection } from './ui/IncidentOverviewSection';

export function IncidentDetailsWidget(
    props: IncidentDetailsWidgetProps,
): JSX.Element {
    const {
        incidentId,
        showBackButton = true,
        onBack,
        className,
        ...rest
    } = props;

    const { t } = useI18nContext();

    const viewModel = useIncidentDetailsWidget({
        incidentId: incidentId ?? undefined,
    });

    return (
        <Stack
            className={className}
            gap={20}
            {...rest}
        >
            <Card
                variant="default"
                padding="md"
            >
                <Stack gap={16}>
                    <Stack
                        direction="row"
                        justify="between"
                        align="center"
                        gap={12}
                    >
                        <Stack gap={6}>
                            <Heading level={2}>
                                {viewModel.title}
                            </Heading>

                            {viewModel.subtitle ? (
                                <Text variant="muted">
                                    {viewModel.subtitle}
                                </Text>
                            ) : null}
                        </Stack>

                        <Stack
                            direction="row"
                            gap={8}
                            wrap
                        >
                            {showBackButton && onBack ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onBack}
                                >
                                    {t('incident.details.actions.back')}
                                </Button>
                            ) : null}

                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    void viewModel.query.refetch();
                                }}
                            >
                                {t('incident.details.actions.refresh')}
                            </Button>
                        </Stack>
                    </Stack>

                    {viewModel.isLoading ? (
                        <Text>
                            {t('incident.details.loading')}
                        </Text>
                    ) : null}

                    {viewModel.isError ? (
                        <Card
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={8}>
                                <Heading level={4}>
                                    {viewModel.errorTitle}
                                </Heading>

                                <Text variant="muted">
                                    {viewModel.errorSubtitle}
                                </Text>

                                <Stack
                                    direction="row"
                                    gap={8}
                                >
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => {
                                            void viewModel.query.refetch();
                                        }}
                                    >
                                        {t('incident.details.actions.retry')}
                                    </Button>
                                </Stack>
                            </Stack>
                        </Card>
                    ) : null}

                    {viewModel.isEmpty ? (
                        <Card
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={8}>
                                <Heading level={4}>
                                    {viewModel.emptyTitle}
                                </Heading>

                                <Text variant="muted">
                                    {viewModel.emptySubtitle}
                                </Text>
                            </Stack>
                        </Card>
                    ) : null}
                </Stack>
            </Card>

            {!viewModel.isLoading && !viewModel.isError && !viewModel.isEmpty ? (
                <Grid
                    columns={1}
                    gap={20}
                >
                    <IncidentOverviewSection
                        title={t('incident.details.sections.overview.title')}
                        subtitle={t('incident.details.sections.overview.subtitle')}
                        summaryItems={viewModel.summaryItems}
                        tagValues={viewModel.tagValues}
                    />

                    <IncidentMetaSection
                        title={t('incident.details.sections.metadata.title')}
                        subtitle={t('incident.details.sections.metadata.subtitle')}
                        metaItems={viewModel.metaItems}
                        correlationValues={viewModel.correlationValues}
                    />

                    <IncidentMediaSection
                        title={t('incident.details.sections.media.title')}
                        subtitle={t('incident.details.sections.media.subtitle')}
                        mediaLinks={viewModel.mediaLinks}
                    />
                </Grid>
            ) : null}
        </Stack>
    );
}