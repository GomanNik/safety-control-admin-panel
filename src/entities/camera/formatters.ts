// =====================
// File: src/entities/camera/formatters.ts
// Purpose:
//   Camera domain formatters.
//   Used by widgets/features to render statuses, dates, modes and session states.
// =====================

import type { TFunction } from '../../shared/i18n';

import type {
    CameraLiveSession,
    CameraPlayerState,
} from './model';

import type {
    CameraStatus,
    CameraStatusReasonCode,
    CameraVideoMode,
    CameraVideoProfile,
} from './types';

type FormatterOptions = {
    t?: TFunction;
    locale?: string;
};

type DateFormatterOptions = FormatterOptions & {
    now?: Date;
};

const DEFAULT_LOCALE = 'ru-RU';

const translate = (
    t: TFunction | undefined,
    key: string,
    defaultValue: string,
): string => {
    return t
        ? t(key, { defaultValue })
        : defaultValue;
};

const formatDateTime = (
    date: Date,
    locale: string,
): string => {
    return new Intl.DateTimeFormat(locale || DEFAULT_LOCALE, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

export function formatCameraStatus(
    status: CameraStatus | null | undefined,
    options?: FormatterOptions,
): string {
    const t = options?.t;

    switch (status) {
        case 'online':
            return translate(t, 'camera.status.online', 'В сети');
        case 'offline':
            return translate(t, 'camera.status.offline', 'Не в сети');
        case 'problem':
            return translate(t, 'camera.status.problem', 'Требует внимания');
        case 'initializing':
            return translate(t, 'camera.status.initializing', 'Инициализация');
        case 'unknown':
        default:
            return translate(t, 'camera.status.unknown', 'Неизвестно');
    }
}

export function formatCameraStatusReason(
    reason: CameraStatusReasonCode | string | null | undefined,
    options?: FormatterOptions,
): string {
    const t = options?.t;

    switch (reason) {
        case 'no_signal':
            return translate(t, 'camera.statusReason.noSignal', 'Нет сигнала');
        case 'stream_unavailable':
            return translate(t, 'camera.statusReason.streamUnavailable', 'Поток недоступен');
        case 'auth_failed':
            return translate(t, 'camera.statusReason.authFailed', 'Ошибка авторизации');
        case 'high_latency':
            return translate(t, 'camera.statusReason.highLatency', 'Высокая задержка');
        case 'initializing':
            return translate(t, 'camera.statusReason.initializing', 'Инициализация');
        case 'network_unreachable':
            return translate(t, 'camera.statusReason.networkUnreachable', 'Сеть недоступна');
        case 'dns_failed':
            return translate(t, 'camera.statusReason.dnsFailed', 'Ошибка DNS');
        case 'timeout':
            return translate(t, 'camera.statusReason.timeout', 'Таймаут');
        case 'configuration_invalid':
            return translate(t, 'camera.statusReason.configurationInvalid', 'Неверная конфигурация');
        case 'duplicate_source':
            return translate(t, 'camera.statusReason.duplicateSource', 'Источник уже привязан');
        case 'unknown':
        default:
            return translate(t, 'camera.statusReason.unknown', 'Причина не указана');
    }
}

export function formatCameraLastSeenAt(
    date: Date | null | undefined,
    options?: DateFormatterOptions,
): string {
    const locale = options?.locale || DEFAULT_LOCALE;
    const t = options?.t;

    if (!date || Number.isNaN(date.getTime())) {
        return translate(t, 'common.notAvailable', '—');
    }

    return formatDateTime(date, locale);
}

export function formatCameraVideoMode(
    mode: CameraVideoMode | null | undefined,
    options?: FormatterOptions,
): string {
    const t = options?.t;

    switch (mode) {
        case 'processed':
            return translate(t, 'camera.video.mode.processed', 'Обработанный');
        case 'original':
        default:
            return translate(t, 'camera.video.mode.original', 'Оригинал');
    }
}

export function formatCameraVideoProfile(
    profile: CameraVideoProfile | null | undefined,
    options?: FormatterOptions,
): string {
    const t = options?.t;

    switch (profile) {
        case 'grid_preview':
            return translate(t, 'camera.video.profile.gridPreview', 'Превью сетки');
        case 'single_hd':
            return translate(t, 'camera.video.profile.singleHd', 'Одиночный HD');
        case 'processed_grid_preview':
            return translate(t, 'camera.video.profile.processedGridPreview', 'Превью сетки с аналитикой');
        case 'processed_single_hd':
            return translate(t, 'camera.video.profile.processedSingleHd', 'Одиночный HD с аналитикой');
        default:
            return translate(t, 'camera.video.profile.unknown', 'Неизвестный профиль');
    }
}

export function formatCameraLiveSessionStatus(
    session: Pick<CameraLiveSession, 'status'> | null | undefined,
    options?: FormatterOptions,
): string {
    const t = options?.t;

    switch (session?.status) {
        case 'creating':
            return translate(t, 'camera.video.session.creating', 'Создание сеанса');
        case 'ready':
            return translate(t, 'camera.video.session.ready', 'Сеанс готов');
        case 'failed':
            return translate(t, 'camera.video.session.failed', 'Ошибка сеанса');
        case 'expired':
            return translate(t, 'camera.video.session.expired', 'Сеанс истек');
        default:
            return translate(t, 'camera.video.session.idle', 'Сеанс не создан');
    }
}

export function formatCameraPlayerState(
    state: CameraPlayerState | null | undefined,
    options?: FormatterOptions,
): string {
    const t = options?.t;

    switch (state) {
        case 'creating_session':
            return translate(t, 'camera.video.player.creatingSession', 'Создание сеанса');
        case 'connecting':
            return translate(t, 'camera.video.player.connecting', 'Подключение');
        case 'live':
            return translate(t, 'camera.video.player.live', 'В эфире');
        case 'buffering':
            return translate(t, 'camera.video.player.buffering', 'Буферизация');
        case 'reconnecting':
            return translate(t, 'camera.video.player.reconnecting', 'Переподключение');
        case 'ended':
            return translate(t, 'camera.video.player.ended', 'Завершено');
        case 'unavailable':
            return translate(t, 'camera.video.player.unavailable', 'Недоступно');
        case 'failed':
            return translate(t, 'camera.video.player.failed', 'Ошибка');
        case 'idle':
        default:
            return translate(t, 'camera.video.player.idle', 'Ожидание');
    }
}