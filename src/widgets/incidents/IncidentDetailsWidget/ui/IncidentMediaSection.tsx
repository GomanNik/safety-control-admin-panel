// =====================
// src/widgets/incidents/IncidentDetailsWidget/ui/IncidentMediaSection.tsx
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import {
    Button,
    Card,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';

import type { IncidentDetailsWidgetMediaLink } from '../types';

interface IncidentMediaSectionProps {
    title: string;
    subtitle?: string;
    mediaLinks: IncidentDetailsWidgetMediaLink[];
}

function openExternal(
    url: string,
): void {
    window.open(url, '_blank', 'noopener,noreferrer');
}

export function IncidentMediaSection(
    props: IncidentMediaSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        mediaLinks,
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
            {mediaLinks.length === 0 ? (
                <Text variant="muted">
                    {t('incident.details.media.empty')}
                </Text>
            ) : (
                <Stack gap={12}>
                    {mediaLinks.map((link) => (
                        <Card
                            key={link.key}
                            variant="outlined"
                            padding="sm"
                        >
                            <Stack
                                direction="row"
                                justify="between"
                                align="center"
                                gap={12}
                            >
                                <Text as="span">
                                    {link.label}
                                </Text>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openExternal(link.url)}
                                >
                                    {t('incident.details.actions.open')}
                                </Button>
                            </Stack>
                        </Card>
                    ))}
                </Stack>
            )}
        </Card>
    );
}