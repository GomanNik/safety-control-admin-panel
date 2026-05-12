// =====================
// File: src/widgets/cameras/CameraDetailsWidget/CameraDetailsWidget.tsx
// Purpose:
//   Read-only details widget камеры под новый контракт:
//   - hero
//   - video original / processed
//   - overview
//   - realtime feed
//   - delete action
//   Без settings / health / incidents.
// =====================

import type { JSX } from 'react';

import { joinClassNames } from '../../../shared/ui/classNames';
import { useI18nContext } from '../../../shared/i18n';
import {
    Button,
    Card,
    Grid,
    Heading,
    Stack,
    Text,
} from '../../../shared/ui';

import { useCameraDetailsWidget } from './hooks';
import type { CameraDetailsWidgetProps } from './types';
import { CameraOverviewSection } from './ui/CameraOverviewSection';
import { CameraRealtimeSection } from './ui/CameraRealtimeSection';
import { CameraVideoSection } from './ui/CameraVideoSection';

import './CameraDetailsWidget.css';

export function CameraDetailsWidget(
    props: CameraDetailsWidgetProps,
): JSX.Element {
    const {
        cameraId,
        showBackButton = false,
        onBack,
        maxRealtimeItems,
        ...restProps
    } = props;

    const { t } = useI18nContext();

    const viewModel = useCameraDetailsWidget({
        cameraId,
        maxRealtimeItems,
        onBack,
    });

    if (viewModel.isLoading) {
        return (
            <div
                {...restProps}
                className={joinClassNames(
                    'camera-details-widget',
                    restProps.className,
                )}
            >
                <Card
                    variant="default"
                    padding="md"
                    className="camera-details-widget__section-card"
                >
                    <Text>
                        {viewModel.loadingLabel}
                    </Text>
                </Card>
            </div>
        );
    }

    if (viewModel.isError) {
        return (
            <div
                {...restProps}
                className={joinClassNames(
                    'camera-details-widget',
                    restProps.className,
                )}
            >
                <Card
                    variant="default"
                    padding="md"
                    className="camera-details-widget__section-card"
                >
                    <Stack gap={12}>
                        <Stack gap={6}>
                            <Heading level={3}>
                                {viewModel.errorTitle}
                            </Heading>

                            <Text variant="muted">
                                {viewModel.errorSubtitle}
                            </Text>
                        </Stack>

                        <Stack
                            direction="row"
                            gap={8}
                            wrap
                        >
                            {showBackButton ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={viewModel.back}
                                >
                                    {t('camera.details.actions.back')}
                                </Button>
                            ) : null}

                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                    void viewModel.refresh();
                                }}
                                disabled={viewModel.refreshing}
                            >
                                {viewModel.refreshing
                                    ? t('camera.details.refresh.pending')
                                    : t('camera.details.actions.retry')}
                            </Button>
                        </Stack>
                    </Stack>
                </Card>
            </div>
        );
    }

    if (viewModel.isEmpty) {
        return (
            <div
                {...restProps}
                className={joinClassNames(
                    'camera-details-widget',
                    restProps.className,
                )}
            >
                <Card
                    variant="default"
                    padding="md"
                    className="camera-details-widget__section-card"
                >
                    <Stack gap={12}>
                        <Stack gap={6}>
                            <Heading level={3}>
                                {viewModel.emptyTitle}
                            </Heading>

                            <Text variant="muted">
                                {viewModel.emptySubtitle}
                            </Text>
                        </Stack>

                        {showBackButton ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={viewModel.back}
                            >
                                {t('camera.details.actions.back')}
                            </Button>
                        ) : null}
                    </Stack>
                </Card>
            </div>
        );
    }

    return (
        <div
            {...restProps}
            className={joinClassNames(
                'camera-details-widget',
                restProps.className,
            )}
        >
            <Stack
                gap={18}
                className="camera-details-widget__root"
            >
                <Card
                    variant="default"
                    padding="md"
                    className={joinClassNames(
                        'camera-details-widget__hero',
                        `camera-details-widget__hero--${viewModel.header.tone}`,
                    )}
                >
                    <div className="camera-details-widget__hero-top">
                        <div className="camera-details-widget__hero-copy">
                            <Heading level={2}>
                                {viewModel.header.title}
                            </Heading>

                            {viewModel.header.subtitle ? (
                                <Text variant="muted">
                                    {viewModel.header.subtitle}
                                </Text>
                            ) : null}
                        </div>

                        <div className="camera-details-widget__hero-actions">
                            {showBackButton ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={viewModel.back}
                                >
                                    {t('camera.details.actions.back')}
                                </Button>
                            ) : null}

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    void viewModel.refresh();
                                }}
                                disabled={viewModel.refreshing || viewModel.deleting}
                            >
                                {viewModel.refreshing
                                    ? t('camera.details.refresh.pending')
                                    : t('camera.details.actions.refresh')}
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    void viewModel.deleteCurrent();
                                }}
                                disabled={!viewModel.canDelete || viewModel.deleting}
                            >
                                {viewModel.deleting
                                    ? t('camera.details.actions.deleting')
                                    : t('camera.details.actions.delete')}
                            </Button>
                        </div>
                    </div>

                    <div className="camera-details-widget__hero-status">
                        <div
                            className={joinClassNames(
                                'camera-details-widget__status-chip',
                                `camera-details-widget__status-chip--${viewModel.header.tone}`,
                            )}
                        >
                            {viewModel.header.statusLabel}
                        </div>

                        {viewModel.header.reasonLabel ? (
                            <Text
                                variant="muted"
                                className="camera-details-widget__hero-reason"
                            >
                                {viewModel.header.reasonLabel}
                            </Text>
                        ) : null}

                        <div className="camera-details-widget__hero-meta">
                            {viewModel.header.lastSeenAtLabel ? (
                                <Text variant="caption">
                                    {t('camera.details.summary.lastSeenAt')}: {viewModel.header.lastSeenAtLabel}
                                </Text>
                            ) : null}

                            {viewModel.refreshFeedback ? (
                                <Text variant="caption">
                                    {viewModel.refreshFeedback}
                                </Text>
                            ) : null}
                        </div>

                        {viewModel.deleteErrorMessage ? (
                            <Text variant="danger">
                                {viewModel.deleteErrorMessage}
                            </Text>
                        ) : null}
                    </div>
                </Card>

                <Grid
                    className="camera-details-widget__layout"
                    templateColumns="minmax(0, 1.55fr) minmax(320px, 0.95fr)"
                    gap={18}
                    align="start"
                >
                    <Stack gap={18}>
                        <CameraVideoSection
                            title={t('camera.details.sections.video.title')}
                            subtitle={t('camera.details.sections.video.subtitle')}
                            video={viewModel.video}
                        />
                    </Stack>

                    <Stack gap={18}>
                        <CameraOverviewSection
                            title={t('camera.details.sections.monitoring.title')}
                            subtitle={t('camera.details.sections.monitoring.subtitle')}
                            items={viewModel.overviewItems}
                        />

                        <CameraRealtimeSection
                            title={t('camera.details.sections.realtime.title')}
                            subtitle={t('camera.details.sections.realtime.subtitle')}
                            items={viewModel.realtimeItems}
                        />
                    </Stack>
                </Grid>
            </Stack>
        </div>
    );
}