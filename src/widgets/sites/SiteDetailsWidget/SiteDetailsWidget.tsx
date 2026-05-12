// =====================
// File: src/widgets/sites/SiteDetailsWidget/SiteDetailsWidget.tsx
// Purpose:
// - Clean site details widget
// - Site cameras are rendered as simultaneous live stream tiles
// - Camera tiles now use richer session-based video contract
// - Grid tiles explicitly request grid video usage
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../shared/i18n';
import {
    Button,
    Card,
    Heading,
    Stack,
    Text,
} from '../../../shared/ui';

import {
    formatCameraLiveSessionStatus,
    formatCameraPlayerState,
    formatCameraVideoMode,
    formatCameraVideoProfile,
} from '../../../entities/camera';

import { useCameraVideoModel } from '../../../features/camera';

import { useSiteDetailsWidget } from './hooks';
import type {
    SiteDetailsCameraItem,
    SiteDetailsWidgetProps,
} from './types';
import styles from './ui/SiteDetailsWidget.module.css';

interface SiteCameraStreamCardProps {
    item: SiteDetailsCameraItem;
    onOpenCameraDetails?: (cameraId: SiteDetailsCameraItem['id']) => void;
}

function SiteCameraStreamCard(
    props: SiteCameraStreamCardProps,
): JSX.Element {
    const { t, locale } = useI18nContext();
    const {
        item,
        onOpenCameraDetails,
    } = props;

    const video = useCameraVideoModel({
        cameraId: item.id,
        defaultMode: 'original',
        usage: 'grid',
    });

    const canShowVideo = Boolean(
        video.player.isAvailable &&
        video.player.sourceUrl,
    );

    const canReconnect =
        video.player.sessionStatus === 'failed' ||
        video.player.sessionStatus === 'expired' ||
        video.player.playerState === 'failed' ||
        video.player.playerState === 'reconnecting' ||
        (
            !video.isLoading &&
            !canShowVideo
        );

    const stateTone =
        video.player.playerState === 'live'
            ? 'live'
            : video.player.sessionStatus === 'failed' ||
            video.player.playerState === 'failed'
                ? 'critical'
                : video.player.sessionStatus === 'expired'
                    ? 'warning'
                    : video.player.playerState === 'creating_session' ||
                    video.player.playerState === 'connecting' ||
                    video.player.playerState === 'buffering' ||
                    video.player.playerState === 'reconnecting'
                        ? 'progress'
                        : 'idle';

    const playerStateLabel = formatCameraPlayerState(
        video.player.playerState,
        {
            t,
            locale,
        },
    );

    const sessionStatusLabel = formatCameraLiveSessionStatus(
        video.session,
        {
            t,
            locale,
        },
    );

    const modeLabel = formatCameraVideoMode(
        video.controls.mode,
        {
            t,
            locale,
        },
    );

    const profileLabel = formatCameraVideoProfile(
        video.controls.profile,
        {
            t,
            locale,
        },
    );

    const transportLabel = video.player.transport
        ? String(video.player.transport).toUpperCase()
        : null;

    const fallbackActive = Boolean(
        !video.session &&
        video.player.legacyStream?.streamUrl,
    );

    const hasModeSwitch =
        video.controls.availableModes.length > 1;

    return (
        <article
            className={`${styles.cameraStreamCard} ${styles[`cameraStreamCard--${item.tone}`]}`}
        >
            <div className={styles.cameraStreamHeader}>
                <div className={styles.cameraStreamHeaderCopy}>
                    <div className={styles.cameraStreamTitleRow}>
                        {onOpenCameraDetails ? (
                            <button
                                type="button"
                                className={styles.cameraStreamTitleButton}
                                onClick={() => {
                                    onOpenCameraDetails(item.id);
                                }}
                            >
                                <Heading level={4}>
                                    {item.name}
                                </Heading>
                            </button>
                        ) : (
                            <Heading level={4}>
                                {item.name}
                            </Heading>
                        )}

                        <span
                            className={`${styles.liveStateBadge} ${styles[`liveStateBadge--${stateTone}`]}`}
                        >
                            {playerStateLabel}
                        </span>
                    </div>

                    {item.reasonLabel ? (
                        <Text
                            variant="muted"
                            className={styles.cameraStreamReason}
                        >
                            {item.reasonLabel}
                        </Text>
                    ) : null}
                </div>

                <span className={`${styles.pill} ${styles[`pill--${item.tone}`]}`}>
                    {item.stateLabel}
                </span>
            </div>

            <div className={styles.cameraStreamControls}>
                <div className={styles.cameraStreamFacts}>
                    <span className={styles.cameraFact}>
                        {sessionStatusLabel}
                    </span>

                    <span className={styles.cameraFact}>
                        {profileLabel}
                    </span>

                    <span className={styles.cameraFact}>
                        {modeLabel}
                    </span>

                    {transportLabel ? (
                        <span className={styles.cameraFact}>
                            {transportLabel}
                        </span>
                    ) : null}

                    {fallbackActive ? (
                        <span className={styles.cameraFact}>
                            {t('site.details.sections.cameras.video.fallback', {
                                defaultValue: 'Fallback',
                            })}
                        </span>
                    ) : null}
                </div>

                <div className={styles.cameraStreamActions}>
                    {hasModeSwitch ? (
                        <div className={styles.cameraModeSwitch}>
                            {video.controls.availableModes.map((mode) => (
                                <Button
                                    key={mode}
                                    variant={video.controls.mode === mode ? 'primary' : 'outline'}
                                    size="sm"
                                    onClick={() => {
                                        video.controls.setMode(mode);
                                    }}
                                >
                                    {formatCameraVideoMode(mode, {
                                        t,
                                        locale,
                                    })}
                                </Button>
                            ))}
                        </div>
                    ) : null}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void video.controls.refresh();
                        }}
                    >
                        {t('camera.details.actions.refresh', {
                            defaultValue: 'Refresh',
                        })}
                    </Button>

                    {canReconnect ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                void video.controls.reconnect();
                            }}
                        >
                            {t('camera.details.video.actions.reconnect', {
                                defaultValue: 'Reconnect',
                            })}
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className={styles.cameraStreamViewport}>
                {video.isLoading ? (
                    <div className={styles.cameraStreamPlaceholder}>
                        <Heading level={5}>
                            {t('camera.details.video.loading.title', {
                                defaultValue: 'Starting live session',
                            })}
                        </Heading>

                        <Text variant="muted">
                            {sessionStatusLabel}
                        </Text>
                    </div>
                ) : canShowVideo ? (
                    <video
                        key={`${item.id}:${video.player.mode}:${video.player.profile}:${video.player.sourceUrl ?? ''}`}
                        className={styles.cameraStreamVideo}
                        src={video.player.sourceUrl}
                        autoPlay
                        muted
                        playsInline
                    />
                ) : (
                    <div className={styles.cameraStreamPlaceholder}>
                        <Heading level={5}>
                            {video.player.sessionStatus === 'failed'
                                ? t('camera.details.video.session.failed', {
                                    defaultValue: 'Live session failed',
                                })
                                : video.player.sessionStatus === 'expired'
                                    ? t('camera.details.video.session.expired', {
                                        defaultValue: 'Live session expired',
                                    })
                                    : t('camera.details.video.empty', {
                                        defaultValue: 'Video unavailable',
                                    })}
                        </Heading>

                        <Text variant="muted">
                            {video.player.errorMessage
                                ? video.player.errorMessage
                                : t('camera.details.video.stream.unavailableHint', {
                                    defaultValue: 'The camera stream is temporarily unavailable.',
                                })}
                        </Text>
                    </div>
                )}
            </div>

            <div className={styles.cameraStreamMeta}>
                <Text variant="caption">
                    {item.statusLabel}
                </Text>

                <Text variant="caption">
                    {item.lastSeenLabel}
                </Text>

                {video.player.sessionId ? (
                    <Text
                        variant="caption"
                        className={styles.cameraStreamTechnicalLine}
                    >
                        {t('camera.details.video.session.id', {
                            defaultValue: 'Session: {{value}}',
                            value: video.player.sessionId,
                        })}
                    </Text>
                ) : null}

                {video.player.errorCode ? (
                    <Text
                        variant="caption"
                        className={styles.cameraStreamTechnicalLine}
                    >
                        {t('camera.details.video.error.code', {
                            defaultValue: 'Error: {{value}}',
                            value: video.player.errorCode,
                        })}
                    </Text>
                ) : null}
            </div>
        </article>
    );
}

export function SiteDetailsWidget(
    props: SiteDetailsWidgetProps,
): JSX.Element {
    const { t } = useI18nContext();

    const {
        className,
        siteId,
        onEditSite,
        onClose,
        onDeleted,
        onOpenCameraDetails,
        ...rest
    } = props;

    const viewModel = useSiteDetailsWidget({
        siteId,
        onEditSite,
        onClose,
        onDeleted,
        onOpenCameraDetails,
    });

    return (
        <div
            className={[
                styles.root,
                className ?? '',
            ].filter(Boolean).join(' ')}
            {...rest}
        >
            <Stack gap={16}>
                <Card
                    variant="default"
                    padding="md"
                    header={(
                        <div className={styles.hero}>
                            <div className={styles.heroCopy}>
                                <Heading level={2}>
                                    {viewModel.title}
                                </Heading>

                                {viewModel.subtitle ? (
                                    <Text variant="muted">
                                        {viewModel.subtitle}
                                    </Text>
                                ) : null}
                            </div>

                            <div className={styles.heroActions}>
                                {viewModel.site ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={viewModel.callbacks.editSite}
                                    >
                                        {t('site.details.actions.edit')}
                                    </Button>
                                ) : null}

                                {viewModel.site ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={viewModel.deletingSite}
                                        onClick={() => {
                                            void viewModel.callbacks.deleteSite();
                                        }}
                                    >
                                        {viewModel.deletingSite
                                            ? t('site.details.actions.deleting')
                                            : t('site.details.actions.delete')}
                                    </Button>
                                ) : null}

                                {onClose ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={viewModel.callbacks.close}
                                    >
                                        {t('site.details.actions.back')}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    )}
                >
                    {viewModel.error ? (
                        <Text variant="muted">
                            {viewModel.error}
                        </Text>
                    ) : null}

                    {viewModel.deleteSiteError ? (
                        <Text className={styles.errorText}>
                            {viewModel.deleteSiteError}
                        </Text>
                    ) : null}
                </Card>

                {viewModel.loading ? (
                    <Card
                        variant="default"
                        padding="md"
                    >
                        <Text variant="muted">
                            {t('site.details.loadingRelated')}
                        </Text>
                    </Card>
                ) : null}

                {!viewModel.loading && !viewModel.error ? (
                    <>
                        {viewModel.overviewItems.length > 0 ? (
                            <Card
                                variant="default"
                                padding="md"
                                header={(
                                    <div className={styles.sectionHeader}>
                                        <Heading level={3}>
                                            {t('site.details.sections.overview.title')}
                                        </Heading>

                                        <Text variant="muted">
                                            {t('site.details.sections.overview.subtitle')}
                                        </Text>
                                    </div>
                                )}
                            >
                                <div className={styles.fieldsGrid}>
                                    {viewModel.overviewItems.map((item) => (
                                        <div
                                            key={item.key}
                                            className={styles.fieldCard}
                                        >
                                            <Text
                                                variant="caption"
                                                className={styles.fieldLabel}
                                            >
                                                {item.label}
                                            </Text>

                                            <Text>
                                                {item.value}
                                            </Text>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ) : null}

                        {viewModel.addressItems.length > 0 ? (
                            <Card
                                variant="default"
                                padding="md"
                                header={(
                                    <div className={styles.sectionHeader}>
                                        <Heading level={3}>
                                            {t('site.details.sections.address.title')}
                                        </Heading>

                                        <Text variant="muted">
                                            {t('site.details.sections.address.subtitle')}
                                        </Text>
                                    </div>
                                )}
                            >
                                <div className={styles.fieldsGrid}>
                                    {viewModel.addressItems.map((item) => (
                                        <div
                                            key={item.key}
                                            className={styles.fieldCard}
                                        >
                                            <Text
                                                variant="caption"
                                                className={styles.fieldLabel}
                                            >
                                                {item.label}
                                            </Text>

                                            <Text>
                                                {item.value}
                                            </Text>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ) : null}

                        {viewModel.contactItems.length > 0 ? (
                            <Card
                                variant="default"
                                padding="md"
                                header={(
                                    <div className={styles.sectionHeader}>
                                        <Heading level={3}>
                                            {t('site.details.sections.contact.title')}
                                        </Heading>

                                        <Text variant="muted">
                                            {t('site.details.sections.contact.subtitle')}
                                        </Text>
                                    </div>
                                )}
                            >
                                <div className={styles.fieldsGrid}>
                                    {viewModel.contactItems.map((item) => (
                                        <div
                                            key={item.key}
                                            className={styles.fieldCard}
                                        >
                                            <Text
                                                variant="caption"
                                                className={styles.fieldLabel}
                                            >
                                                {item.label}
                                            </Text>

                                            <Text>
                                                {item.value}
                                            </Text>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ) : null}

                        <Card
                            variant="default"
                            padding="md"
                            header={(
                                <div className={styles.sectionHeader}>
                                    <Heading level={3}>
                                        {t('site.details.sections.summary.title')}
                                    </Heading>

                                    <Text variant="muted">
                                        {t('site.details.sections.summary.subtitle')}
                                    </Text>
                                </div>
                            )}
                        >
                            <div className={styles.summaryGrid}>
                                <div className={styles.summaryCard}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.details.summary.total')}
                                    </Text>

                                    <Heading level={3}>
                                        {viewModel.summary.total}
                                    </Heading>
                                </div>

                                <div className={styles.summaryCard}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.details.summary.online')}
                                    </Text>

                                    <Heading level={3}>
                                        {viewModel.summary.online}
                                    </Heading>
                                </div>

                                <div className={styles.summaryCard}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.details.summary.problematic')}
                                    </Text>

                                    <Heading level={3}>
                                        {viewModel.summary.problematic}
                                    </Heading>
                                </div>

                                <div className={styles.summaryCard}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.details.summary.offline')}
                                    </Text>

                                    <Heading level={3}>
                                        {viewModel.summary.offline}
                                    </Heading>
                                </div>

                                <div className={styles.summaryCard}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.details.summary.incidents')}
                                    </Text>

                                    <Heading level={3}>
                                        {viewModel.summary.incidents}
                                    </Heading>
                                </div>
                            </div>
                        </Card>

                        <Card
                            variant="default"
                            padding="md"
                            header={(
                                <div className={styles.sectionHeader}>
                                    <Heading level={3}>
                                        {t('site.details.sections.cameras.title')}
                                    </Heading>

                                    <Text variant="muted">
                                        {t('site.details.sections.cameras.subtitle')}
                                    </Text>
                                </div>
                            )}
                        >
                            {viewModel.cameras.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Text variant="muted">
                                        {t('site.details.sections.cameras.empty')}
                                    </Text>
                                </div>
                            ) : (
                                <div className={styles.cameraStreamsGrid}>
                                    {viewModel.cameras.map((item) => (
                                        <SiteCameraStreamCard
                                            key={item.id}
                                            item={item}
                                            onOpenCameraDetails={onOpenCameraDetails}
                                        />
                                    ))}
                                </div>
                            )}
                        </Card>
                    </>
                ) : null}
            </Stack>
        </div>
    );
}