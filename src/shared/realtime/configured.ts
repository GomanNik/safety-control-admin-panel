// =====================
// File: src/shared/realtime/configured.ts
// Purpose:
// - Shared helpers for mapping AppConfig.realtime to realtime client config
// - Normalized endpoint handling
// - Generic-aware factories
// =====================

import type { AppConfig, RealtimeConfig } from '../config';
import {
    createRealtimeClient,
    type RealtimeClient,
} from './client';
import {
    type RealtimeChannelMap,
    type RealtimeClientConfig,
    type RealtimeReconnectConfig,
    type RealtimeTransport,
} from './types';
import {
    createRealtimeConnectionManager,
    type RealtimeConnectionManager,
} from './connection-manager';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger()
    .child('shared')
    .child('realtime')
    .child('configured');

/**
 * Дополнительные настройки для маппинга RealtimeConfig → RealtimeClientConfig.
 */
export interface RealtimeClientConfigOverrides extends Partial<
    Omit<RealtimeClientConfig, 'url' | 'transport' | 'reconnect'>
> {}

/**
 * Опции создания RealtimeClient / ConnectionManager из AppConfig.
 */
export interface CreateRealtimeClientFromAppConfigOptions {
    transportOverride?: RealtimeTransport;
    reconnectOverrides?: Partial<RealtimeReconnectConfig>;
    clientOverrides?: RealtimeClientConfigOverrides;
}

const normalizeEndpointUrl = (endpointUrl: string): string =>
    String(endpointUrl ?? '').trim();

const inferTransportFromEndpointUrl = (
    endpointUrl: string,
): RealtimeTransport => {
    const value = normalizeEndpointUrl(endpointUrl).toLowerCase();

    if (value.startsWith('ws://') || value.startsWith('wss://')) {
        return 'ws';
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
        return 'ws';
    }

    return 'ws';
};

const mapRealtimeConfigToReconnect = (
    realtime: RealtimeConfig,
    overrides?: Partial<RealtimeReconnectConfig>,
): RealtimeReconnectConfig => {
    const base: RealtimeReconnectConfig = {
        enabled: realtime.enabled,
        maxAttempts: realtime.maxReconnectAttempts,
        initialDelayMs: realtime.reconnectIntervalMs,
        maxDelayMs: realtime.reconnectIntervalMs,
        multiplier: 1,
        jitterRatio: 0,
    };

    const mapped: RealtimeReconnectConfig = {
        ...base,
        ...(overrides ?? {}),
    };

    logger.debug('mapRealtimeConfigToReconnect', {
        enabled: mapped.enabled,
        maxAttempts: mapped.maxAttempts,
        initialDelayMs: mapped.initialDelayMs,
        maxDelayMs: mapped.maxDelayMs,
        multiplier: mapped.multiplier,
        jitterRatio: mapped.jitterRatio,
        hasOverrides: Boolean(overrides),
    });

    return mapped;
};

export const createRealtimeClientConfigFromRealtimeConfig = (
    realtime: RealtimeConfig,
    options?: CreateRealtimeClientFromAppConfigOptions,
): RealtimeClientConfig => {
    const endpointUrl = normalizeEndpointUrl(realtime.endpointUrl);

    const transport: RealtimeTransport =
        options?.transportOverride ??
        inferTransportFromEndpointUrl(endpointUrl);

    const reconnect = mapRealtimeConfigToReconnect(
        realtime,
        options?.reconnectOverrides,
    );

    const baseConfig: RealtimeClientConfig = {
        url: endpointUrl,
        transport,
        reconnect,
        autoConnect: Boolean(realtime.enabled),
        debug: false,
    };

    const clientOverrides = options?.clientOverrides ?? {};

    const finalConfig: RealtimeClientConfig = {
        ...baseConfig,
        ...clientOverrides,
        url: endpointUrl,
        transport,
        reconnect,
    };

    logger.info('createRealtimeClientConfigFromRealtimeConfig', {
        url: finalConfig.url,
        transport: finalConfig.transport,
        autoConnect: finalConfig.autoConnect,
        debug: finalConfig.debug,
        reconnect: finalConfig.reconnect
            ? {
                enabled: finalConfig.reconnect.enabled,
                maxAttempts: finalConfig.reconnect.maxAttempts,
                initialDelayMs:
                    finalConfig.reconnect.initialDelayMs,
                maxDelayMs: finalConfig.reconnect.maxDelayMs,
                multiplier: finalConfig.reconnect.multiplier,
                jitterRatio: finalConfig.reconnect.jitterRatio,
            }
            : undefined,
        overrides: {
            transportOverride: options?.transportOverride,
            hasReconnectOverrides:
                Boolean(options?.reconnectOverrides),
            clientOverridesKeys: Object.keys(clientOverrides),
        },
    });

    return finalConfig;
};

export const createRealtimeClientConfigFromAppConfig = (
    config: AppConfig,
    options?: CreateRealtimeClientFromAppConfigOptions,
): RealtimeClientConfig => {
    return createRealtimeClientConfigFromRealtimeConfig(
        config.realtime,
        options,
    );
};

export const createRealtimeClientFromAppConfig = <
    TChannels extends RealtimeChannelMap = RealtimeChannelMap,
>(
    config: AppConfig,
    options?: CreateRealtimeClientFromAppConfigOptions,
): RealtimeClient<TChannels> => {
    const clientConfig = createRealtimeClientConfigFromAppConfig(
        config,
        options,
    );

    logger.info('createRealtimeClientFromAppConfig', {
        url: clientConfig.url,
        transport: clientConfig.transport,
        autoConnect: clientConfig.autoConnect,
    });

    return createRealtimeClient<TChannels>(clientConfig);
};

/**
 * Дополнительные опции для создания ConnectionManager.
 */
export interface CreateRealtimeConnectionManagerFromAppConfigOptions
    extends CreateRealtimeClientFromAppConfigOptions {
    /**
     * Явное управление автоподключением на уровне менеджера.
     */
    autoConnect?: boolean;
}

export const createRealtimeConnectionManagerFromAppConfig = (
    config: AppConfig,
    options?: CreateRealtimeConnectionManagerFromAppConfigOptions,
): RealtimeConnectionManager => {
    const clientConfig = createRealtimeClientConfigFromAppConfig(
        config,
        options,
    );

    const autoConnect =
        options?.autoConnect ??
        clientConfig.autoConnect ??
        false;

    const effectiveConfig: RealtimeClientConfig = {
        ...clientConfig,
        autoConnect,
        reconnect: clientConfig.reconnect
            ? {
                ...clientConfig.reconnect,
                enabled:
                    Boolean(autoConnect) &&
                    Boolean(clientConfig.reconnect.enabled),
            }
            : clientConfig.reconnect,
    };

    logger.info(
        'createRealtimeConnectionManagerFromAppConfig',
        {
            url: effectiveConfig.url,
            transport: effectiveConfig.transport,
            clientAutoConnect: clientConfig.autoConnect,
            managerAutoConnect: autoConnect,
            reconnectEnabled: effectiveConfig.reconnect?.enabled,
        },
    );

    return createRealtimeConnectionManager({
        config: effectiveConfig,
        autoConnect,
    });
};