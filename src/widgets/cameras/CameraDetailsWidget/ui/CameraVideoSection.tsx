// =====================
// File: src/widgets/cameras/CameraDetailsWidget/ui/CameraVideoSection.tsx
// Purpose:
//   Видео-секция details widget камеры под новый контракт:
//   - live stream
//   - mode switch original / processed
//   - stream availability
//   Без overlay / incidents / latency / segments.
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import { joinClassNames } from '../../../../shared/ui/classNames';
import {
    Button,
    Card,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';

import type {
    CameraDetailsWidgetTone,
    CameraDetailsWidgetVideoState,
} from '../types';

interface CameraVideoSectionProps {
    title: string;
    subtitle?: string;
    video: CameraDetailsWidgetVideoState;
}

function getModeLabel(
    mode: CameraDetailsWidgetVideoState['mode'],
    t: ReturnType<typeof useI18nContext>['t'],
): string {
    switch (mode) {
        case 'processed':
            return t('camera.details.video.mode.processed');
        case 'original':
        default:
            return t('camera.details.video.mode.original');
    }
}

function mapToneClass(
    tone: CameraDetailsWidgetTone,
): string {
    return `camera-details-widget__signal-card--${tone}`;
}

export function CameraVideoSection(
    props: CameraVideoSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        video,
    } = props;

    const { t } = useI18nContext();

    const streamTone: CameraDetailsWidgetTone = video.isAvailable
        ? 'success'
        : 'critical';

    const processedTone: CameraDetailsWidgetTone = video.processedAvailable
        ? 'success'
        : 'neutral';

    return (
        <Card
            variant="default"
            padding="md"
            className="camera-details-widget__section-card camera-details-widget__video-card"
            header={(
                <Stack gap={12}>
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

                    <div className="camera-details-widget__video-controls">
                        <div className="camera-details-widget__video-control-group">
                            {video.availableModes.map((mode) => (
                                <Button
                                    key={mode}
                                    variant={video.mode === mode ? 'primary' : 'outline'}
                                    size="sm"
                                    onClick={() => {
                                        video.setMode(mode);
                                    }}
                                >
                                    {getModeLabel(mode, t)}
                                </Button>
                            ))}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                void video.refresh();
                            }}
                        >
                            {t('camera.details.actions.refresh')}
                        </Button>
                    </div>
                </Stack>
            )}
        >
            <div className="camera-details-widget__video-body">
                {video.isAvailable && video.sourceUrl ? (
                    <div className="camera-details-widget__video-player-shell">
                        <video
                            key={`${video.mode}:${video.sourceUrl ?? ''}`}
                            controls
                            src={video.sourceUrl}
                            className="camera-details-widget__video-player"
                            playsInline
                        />
                    </div>
                ) : (
                    <div className="camera-details-widget__video-empty">
                        <Heading level={4}>
                            {t('camera.details.video.empty')}
                        </Heading>

                        <Text variant="muted">
                            {t('camera.details.video.stream.unavailableHint')}
                        </Text>
                    </div>
                )}

                <div className="camera-details-widget__signal-grid">
                    <div
                        className={joinClassNames(
                            'camera-details-widget__signal-card',
                            mapToneClass(streamTone),
                        )}
                    >
                        <Text
                            as="span"
                            variant="caption"
                            className="camera-details-widget__signal-label"
                        >
                            {t('camera.details.video.stream.status')}
                        </Text>

                        <Heading level={4}>
                            {video.isAvailable
                                ? t('camera.details.video.stream.available')
                                : t('camera.details.video.stream.unavailable')}
                        </Heading>
                    </div>

                    <div
                        className={joinClassNames(
                            'camera-details-widget__signal-card',
                            'camera-details-widget__signal-card--neutral',
                        )}
                    >
                        <Text
                            as="span"
                            variant="caption"
                            className="camera-details-widget__signal-label"
                        >
                            {t('camera.details.video.mode.current')}
                        </Text>

                        <Heading level={4}>
                            {getModeLabel(video.mode, t)}
                        </Heading>
                    </div>

                    <div
                        className={joinClassNames(
                            'camera-details-widget__signal-card',
                            mapToneClass(processedTone),
                        )}
                    >
                        <Text
                            as="span"
                            variant="caption"
                            className="camera-details-widget__signal-label"
                        >
                            {t('camera.details.video.processed.status')}
                        </Text>

                        <Heading level={4}>
                            {video.processedAvailable
                                ? t('camera.details.video.processed.available')
                                : t('camera.details.video.processed.unavailable')}
                        </Heading>
                    </div>
                </div>
            </div>
        </Card>
    );
}