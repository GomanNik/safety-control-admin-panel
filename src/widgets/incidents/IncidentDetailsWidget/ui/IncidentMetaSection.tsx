// =====================
// src/widgets/incidents/IncidentDetailsWidget/ui/IncidentMetaSection.tsx
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

import type { IncidentDetailsWidgetMetaItem } from '../types';

interface IncidentMetaSectionProps {
    title: string;
    subtitle?: string;
    metaItems: IncidentDetailsWidgetMetaItem[];
    correlationValues: string[];
}

export function IncidentMetaSection(
    props: IncidentMetaSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        metaItems,
        correlationValues,
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
                    minColumnWidth={220}
                    gap={12}
                >
                    {metaItems.map((item) => (
                        <Card
                            key={item.label}
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack gap={6}>
                                <Text variant="caption">
                                    {item.label}
                                </Text>

                                <Text as="span">
                                    {item.value}
                                </Text>
                            </Stack>
                        </Card>
                    ))}
                </Grid>

                {correlationValues.length > 0 ? (
                    <Stack gap={8}>
                        <Text variant="caption">
                            {t('incident.details.labels.correlationIds')}
                        </Text>

                        <Stack
                            direction="row"
                            gap={8}
                            wrap
                        >
                            {correlationValues.map((value) => (
                                <Tag
                                    key={value}
                                    variant="outline"
                                >
                                    {value}
                                </Tag>
                            ))}
                        </Stack>
                    </Stack>
                ) : null}
            </Stack>
        </Card>
    );
}