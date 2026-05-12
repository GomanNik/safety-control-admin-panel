// =====================
// src/widgets/incidents/IncidentDetailsWidget/ui/IncidentOverviewSection.tsx
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import {
    Card,
    Grid,
    Heading,
    Stack,
    Tag,
    Text,
} from '../../../../shared/ui';

import type { IncidentDetailsWidgetSummaryItem } from '../types';

interface IncidentOverviewSectionProps {
    title: string;
    subtitle?: string;
    summaryItems: IncidentDetailsWidgetSummaryItem[];
    tagValues: string[];
}

export function IncidentOverviewSection(
    props: IncidentOverviewSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        summaryItems,
        tagValues,
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
            <Stack gap={16}>
                <Grid
                    columns="auto-fit"
                    minColumnWidth={180}
                    gap={12}
                >
                    {summaryItems.map((item) => (
                        <Card
                            key={item.label}
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={6}>
                                <Text
                                    variant="caption"
                                    as="span"
                                >
                                    {item.label}
                                </Text>

                                <Heading level={4}>
                                    {item.value}
                                </Heading>
                            </Stack>
                        </Card>
                    ))}
                </Grid>

                {tagValues.length > 0 ? (
                    <Stack gap={8}>
                        <Text variant="caption">
                            {t('incident.details.labels.tags')}
                        </Text>

                        <Stack
                            direction="row"
                            gap={8}
                            wrap
                        >
                            {tagValues.map((tag) => (
                                <Tag
                                    key={tag}
                                    variant="info"
                                >
                                    {tag}
                                </Tag>
                            ))}
                        </Stack>
                    </Stack>
                ) : null}
            </Stack>
        </Card>
    );
}