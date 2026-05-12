// =====================
// File: src/features/camera/camera-realtime/mappers.ts
// Purpose:
//   Presentation mappers for camera realtime feed.
//   Converts entity-level camera/video realtime events into feed items.
// =====================

import type { TFunction } from '../../../shared/i18n';
import {
    formatCameraLiveSessionStatus,
    formatCameraPlayerState,
    formatCameraStatus,
    formatCameraStatusReason,
    formatCameraVideoMode,
    formatCameraVideoProfile,
    type CameraRealtimeEventPayload,
    type CameraVideoRealtimeEventPayload,
} from '../../../entities/camera';

import type {
    CameraRealtimeFeedItem,
    CameraRealtimeFeedSeverity,
} from './types';

const mapCameraStatusToSeverity = (
    status: string | undefined,
): CameraRealtimeFeedSeverity => {
    switch (status) {
        case 'online':
            return 'success';
        case 'problem':
            return 'warning';
        case 'offline':
            return 'critical';
        default:
            return 'info';
    }
};

const mapVideoEventToSeverity = (
    event: CameraVideoRealtimeEventPayload,
): CameraRealtimeFeedSeverity => {
    switch (event.type) {
        case 'live_session.ready':
            return 'success';

        case 'live_session.failed':
            return 'critical';

        case 'live_session.expired':
            return 'warning';

        case 'stream.health_changed':
            return event.status === 'error'
                ? 'critical'
                : event.status === 'degraded'
                    ? 'warning'
                    : 'info';

        default:
            return 'info';
    }
};

const buildOccurredAt = (
    timestamp: number,
): Date => {
    const normalized = new Date(timestamp);

    return Number.isNaN(normalized.getTime())
        ? new Date()
        : normalized;
};

export const mapCameraRealtimeEventToFeedItem = (args: {
    event: CameraRealtimeEventPayload;
    t: TFunction;
    locale: string;
}): CameraRealtimeFeedItem => {
    const {
        event,
        t,
        locale,
    } = args;

    const occurredAt = buildOccurredAt(event.timestamp);
    const camera = event.camera;
    const statusLabel = formatCameraStatus(camera.status, {
        t,
        locale,
    });
    const reasonLabel = camera.statusReason
        ? formatCameraStatusReason(camera.statusReason, {
            t,
            locale,
        })
        : undefined;

    let title = t('camera.realtime.camera.updated.title', {
        defaultValue: 'Camera updated',
    });

    let message = t('camera.realtime.camera.updated.message', {
        defaultValue: 'Current status: {{status}}',
        status: statusLabel,
    });

    switch (event.type) {
        case 'status_changed':
        case 'camera.status_changed':
            title = t('camera.realtime.camera.statusChanged.title', {
                defaultValue: 'Camera status changed',
            });
            message = reasonLabel
                ? t('camera.realtime.camera.statusChanged.messageWithReason', {
                    defaultValue: '{{status}} · {{reason}}',
                    status: statusLabel,
                    reason: reasonLabel,
                })
                : t('camera.realtime.camera.statusChanged.message', {
                    defaultValue: '{{status}}',
                    status: statusLabel,
                });
            break;

        case 'camera.runtime_changed':
            title = t('camera.realtime.camera.runtimeChanged.title', {
                defaultValue: 'Camera runtime changed',
            });
            message = camera.runtimeState
                ? t('camera.realtime.camera.runtimeChanged.message', {
                    defaultValue: 'Connectivity: {{connectivity}} · Stream: {{stream}}',
                    connectivity: camera.runtimeState.connectivityState,
                    stream: camera.runtimeState.streamState,
                })
                : t('camera.realtime.camera.runtimeChanged.messageFallback', {
                    defaultValue: 'Runtime state updated',
                });
            break;

        case 'updated':
        case 'camera.updated':
        default:
            break;
    }

    return {
        key: `camera:${event.type}:${camera.id}:${event.timestamp}`,
        source: 'camera',
        eventType: event.type,
        cameraId: camera.id,
        title,
        message,
        severity: mapCameraStatusToSeverity(camera.status),
        occurredAt,
    };
};

export const mapCameraVideoRealtimeEventToFeedItem = (args: {
    event: CameraVideoRealtimeEventPayload;
    t: TFunction;
    locale: string;
}): CameraRealtimeFeedItem => {
    const {
        event,
        t,
        locale,
    } = args;

    const occurredAt = buildOccurredAt(event.timestamp);

    const modeLabel = event.mode
        ? formatCameraVideoMode(event.mode, {
            t,
            locale,
        })
        : undefined;

    const profileLabel = event.profile
        ? formatCameraVideoProfile(event.profile, {
            t,
            locale,
        })
        : undefined;

    let title = t('camera.realtime.video.updated.title', {
        defaultValue: 'Video updated',
    });

    let message = undefined as string | undefined;

    switch (event.type) {
        case 'stream_updated':
            title = t('camera.realtime.video.streamUpdated.title', {
                defaultValue: 'Video stream updated',
            });
            message = [modeLabel, profileLabel]
                .filter(Boolean)
                .join(' · ') || undefined;
            break;

        case 'live_session.created':
            title = t('camera.realtime.video.liveSessionCreated.title', {
                defaultValue: 'Live session created',
            });
            message = [modeLabel, profileLabel]
                .filter(Boolean)
                .join(' · ') || undefined;
            break;

        case 'live_session.ready':
            title = t('camera.realtime.video.liveSessionReady.title', {
                defaultValue: 'Live session ready',
            });
            message = [
                formatCameraLiveSessionStatus({ status: 'ready' }, {
                    t,
                    locale,
                }),
                formatCameraPlayerState('live', {
                    t,
                    locale,
                }),
                modeLabel,
                profileLabel,
            ]
                .filter(Boolean)
                .join(' · ');
            break;

        case 'live_session.failed':
            title = t('camera.realtime.video.liveSessionFailed.title', {
                defaultValue: 'Live session failed',
            });
            message = event.status
                ? t('camera.realtime.video.liveSessionFailed.message', {
                    defaultValue: 'State: {{status}}',
                    status: event.status,
                })
                : t('camera.realtime.video.liveSessionFailed.messageFallback', {
                    defaultValue: 'The live session failed to start or continue.',
                });
            break;

        case 'live_session.expired':
            title = t('camera.realtime.video.liveSessionExpired.title', {
                defaultValue: 'Live session expired',
            });
            message = formatCameraLiveSessionStatus({ status: 'expired' }, {
                t,
                locale,
            });
            break;

        case 'stream.health_changed':
            title = t('camera.realtime.video.streamHealthChanged.title', {
                defaultValue: 'Video stream health changed',
            });
            message = event.status
                ? t('camera.realtime.video.streamHealthChanged.message', {
                    defaultValue: 'Health: {{status}}',
                    status: event.status,
                })
                : undefined;
            break;

        case 'stream.bitrate_changed':
            title = t('camera.realtime.video.streamBitrateChanged.title', {
                defaultValue: 'Video bitrate changed',
            });
            message = typeof event.bitrateKbps === 'number'
                ? t('camera.realtime.video.streamBitrateChanged.message', {
                    defaultValue: '{{bitrate}} kbps',
                    bitrate: event.bitrateKbps,
                })
                : undefined;
            break;

        case 'stream.fps_changed':
            title = t('camera.realtime.video.streamFpsChanged.title', {
                defaultValue: 'Video FPS changed',
            });
            message = typeof event.fps === 'number'
                ? t('camera.realtime.video.streamFpsChanged.message', {
                    defaultValue: '{{fps}} fps',
                    fps: event.fps,
                })
                : undefined;
            break;

        case 'overlay.updated':
            title = t('camera.realtime.video.overlayUpdated.title', {
                defaultValue: 'Overlay updated',
            });
            message = event.overlay
                ? t('camera.realtime.video.overlayUpdated.message', {
                    defaultValue: 'Objects: {{count}}',
                    count: event.overlay.objects.length,
                })
                : undefined;
            break;

        default:
            break;
    }

    return {
        key: `video:${event.type}:${event.cameraId}:${event.sessionId ?? 'none'}:${event.timestamp}`,
        source: 'video',
        eventType: event.type,
        cameraId: event.cameraId,
        sessionId: event.sessionId,
        title,
        message,
        severity: mapVideoEventToSeverity(event),
        occurredAt,
    };
};