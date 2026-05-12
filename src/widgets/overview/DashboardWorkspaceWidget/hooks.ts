// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/hooks.ts
// Purpose:
// - Dashboard widget helpers
// - Adapted to simplified camera contract:
//   status + statusReason + stale state
// =====================

import type { DashboardWidgetTone } from './types';

export type DashboardCameraReasonCode =
    | 'stable'
    | 'offline'
    | 'stale'
    | 'problemNoSignal'
    | 'problemStreamUnavailable'
    | 'problemAuthFailed'
    | 'problemHighLatency'
    | 'initializing'
    | 'unknown';

const normalizeToken = (
    value: unknown,
): string => {
    if (typeof value === 'string') {
        return value.trim().toLowerCase();
    }

    if (value == null) {
        return '';
    }

    return String(value).trim().toLowerCase();
};

export const mapDashboardStateToTone = (
    state: 'normal' | 'warning' | 'critical',
): DashboardWidgetTone => {
    switch (state) {
        case 'critical':
            return 'critical';
        case 'warning':
            return 'warning';
        case 'normal':
        default:
            return 'success';
    }
};

export const getDashboardCameraReasonCode = (params: {
    status: unknown;
    statusReason: unknown;
    isStale: boolean;
}): DashboardCameraReasonCode => {
    const {
        status,
        statusReason,
        isStale,
    } = params;

    const normalizedStatus = normalizeToken(status);
    const normalizedReason = normalizeToken(statusReason);

    if (normalizedStatus === 'offline') {
        return 'offline';
    }

    if (
        normalizedStatus === 'initializing' ||
        normalizedReason === 'initializing'
    ) {
        return 'initializing';
    }

    if (normalizedReason === 'no_signal') {
        return 'problemNoSignal';
    }

    if (normalizedReason === 'stream_unavailable') {
        return 'problemStreamUnavailable';
    }

    if (normalizedReason === 'auth_failed') {
        return 'problemAuthFailed';
    }

    if (normalizedReason === 'high_latency') {
        return 'problemHighLatency';
    }

    if (isStale) {
        return 'stale';
    }

    if (normalizedStatus === 'online') {
        return 'stable';
    }

    return 'unknown';
};

export const mapDashboardCameraReasonToTone = (
    reasonCode: DashboardCameraReasonCode,
): DashboardWidgetTone => {
    switch (reasonCode) {
        case 'offline':
        case 'problemNoSignal':
        case 'problemStreamUnavailable':
        case 'problemAuthFailed':
            return 'critical';

        case 'stale':
        case 'problemHighLatency':
        case 'unknown':
            return 'warning';

        case 'initializing':
            return 'info';

        case 'stable':
        default:
            return 'success';
    }
};