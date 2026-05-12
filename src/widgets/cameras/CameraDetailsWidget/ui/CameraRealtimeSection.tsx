// =====================
// src/widgets/cameras/CameraDetailsWidget/ui/CameraRealtimeSection.tsx
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import { joinClassNames } from '../../../../shared/ui/classNames';
import {
    Card,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';

import type { CameraDetailsWidgetRealtimeItem } from '../types';

interface CameraRealtimeSectionProps {
    title: string;
    subtitle?: string;
    items: CameraDetailsWidgetRealtimeItem[];
}

export function CameraRealtimeSection(
    props: CameraRealtimeSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        items,
    } = props;

    const { t } = useI18nContext();

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
            {items.length === 0 ? (
                <Text variant="muted">
                    {t('camera.details.realtime.empty')}
                </Text>
            ) : (
                <div className="camera-details-widget__events-list">
                    {items.map((item) => (
                        <div
                            key={item.key}
                            className="camera-details-widget__event-item"
                        >
                            <span
                                className={joinClassNames(
                                    'camera-details-widget__event-marker',
                                    `camera-details-widget__event-marker--${item.severity}`,
                                )}
                                aria-hidden="true"
                            />

                            <div className="camera-details-widget__event-content">
                                <div className="camera-details-widget__event-top">
                                    <Heading
                                        level={4}
                                        className="camera-details-widget__event-title"
                                    >
                                        {item.title}
                                    </Heading>

                                    <Text
                                        as="span"
                                        variant="caption"
                                        className="camera-details-widget__event-time"
                                    >
                                        {item.occurredAtLabel}
                                    </Text>
                                </div>

                                {item.message ? (
                                    <Text variant="muted">
                                        {item.message}
                                    </Text>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}