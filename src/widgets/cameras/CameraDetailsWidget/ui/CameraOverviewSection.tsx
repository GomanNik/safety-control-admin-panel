// =====================
// src/widgets/cameras/CameraDetailsWidget/ui/CameraOverviewSection.tsx
// =====================

import type { JSX } from 'react';

import { joinClassNames } from '../../../../shared/ui/classNames';
import {
    Card,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';

import type { CameraDetailsWidgetOverviewItem } from '../types';

interface CameraOverviewSectionProps {
    title: string;
    subtitle?: string;
    items: CameraDetailsWidgetOverviewItem[];
}

export function CameraOverviewSection(
    props: CameraOverviewSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        items,
    } = props;

    return (
        <Card
            variant="default"
            padding="md"
            className="camera-details-widget__section-card"
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
            <div className="camera-details-widget__signal-grid camera-details-widget__signal-grid--aside">
                {items.map((item) => (
                    <div
                        key={item.key}
                        className={joinClassNames(
                            'camera-details-widget__signal-card',
                            `camera-details-widget__signal-card--${item.tone}`,
                        )}
                    >
                        <Text
                            as="span"
                            variant="caption"
                            className="camera-details-widget__signal-label"
                        >
                            {item.label}
                        </Text>

                        <Heading level={4}>
                            {item.value}
                        </Heading>
                    </div>
                ))}
            </div>
        </Card>
    );
}