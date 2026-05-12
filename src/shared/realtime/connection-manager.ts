// =====================
// File: src/shared/realtime/connection-manager.ts
// Purpose:
// - Shared realtime connection manager
// - Recreates client on structural config changes
// - Keeps reconnect metadata consistent
// =====================

import type { RealtimeClient } from './client';
import { createRealtimeClient } from './client';
import {
    RealtimeClientConfig,
    RealtimeConnectOptions,
    RealtimeConnectionState,
    RealtimeError,
    RealtimeErrorCode,
} from './types';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger()
    .child('shared')
    .child('realtime')
    .child('connection-manager');

const sanitizeClientConfigForLog = (
    cfg: Partial<RealtimeClientConfig>,
): Record<string, unknown> => {
    const reconnect = cfg.reconnect;

    return {
        url: cfg.url,
        transport: cfg.transport,
        protocols: cfg.protocols,
        autoConnect: cfg.autoConnect,
        debug: cfg.debug,
        heartbeatIntervalMs: cfg.heartbeatIntervalMs,
        maxIdleTimeMs: cfg.maxIdleTimeMs,
        connectTimeoutMs: cfg.connectTimeoutMs,
        metadata: cfg.metadata,
        reconnect: reconnect
            ? {
                enabled: reconnect.enabled,
                maxAttempts: reconnect.maxAttempts,
                initialDelayMs: reconnect.initialDelayMs,
                maxDelayMs: reconnect.maxDelayMs,
                multiplier: reconnect.multiplier,
                jitterRatio: reconnect.jitterRatio,
            }
            : undefined,
    };
};

export interface RealtimeConnectionManagerOptions {
    config: RealtimeClientConfig;
    autoConnect?: boolean;
}

export interface RealtimeReconnectSnapshot {
    enabled: boolean;
    nextAttemptAt?: number;
    lastAttemptAt?: number;
    lastDelayMs?: number;
    attemptNumber?: number;
    maxAttempts?: number;
}

export interface RealtimeConnectionSnapshot {
    client: RealtimeClient;
    state: RealtimeConnectionState;
    lastError: RealtimeError | null;

    attempts: number;
    lastConnectedAt?: number;
    lastDisconnectedAt?: number;

    reconnect?: RealtimeReconnectSnapshot;
}

export type RealtimeConnectionManagerSubscriber = (
    snapshot: RealtimeConnectionSnapshot,
) => void;

export interface RealtimeConnectionManager {
    getClient(): RealtimeClient;
    getState(): RealtimeConnectionState;
    getLastError(): RealtimeError | null;
    getSnapshot(): RealtimeConnectionSnapshot;

    connect(options?: RealtimeConnectOptions): Promise<void>;
    disconnect(reason?: string): Promise<void>;

    updateConfig(partialConfig: Partial<RealtimeClientConfig>): void;
    subscribe(subscriber: RealtimeConnectionManagerSubscriber): () => void;
}

function clamp(
    value: number,
    min: number,
    max: number,
): number {
    return Math.max(min, Math.min(max, value));
}

function computeReconnectDelayMs(
    cfg: Required<
        NonNullable<RealtimeClientConfig['reconnect']>
    >,
    attempt: number,
): number {
    const normalizedAttempt = Math.max(1, attempt);
    const base =
        cfg.initialDelayMs *
        Math.pow(cfg.multiplier ?? 1, normalizedAttempt - 1);

    const capped = clamp(
        base,
        cfg.initialDelayMs,
        cfg.maxDelayMs,
    );

    const jitterRatio = cfg.jitterRatio ?? 0;

    if (jitterRatio <= 0) {
        return Math.floor(capped);
    }

    const jitter = capped * jitterRatio;
    const random = (Math.random() * 2 - 1) * jitter;

    return Math.max(0, Math.floor(capped + random));
}

function toRealtimeError(error: unknown): RealtimeError {
    if (
        error &&
        typeof error === 'object' &&
        'code' in (error as any) &&
        'message' in (error as any) &&
        typeof (error as any).code === 'string' &&
        typeof (error as any).message === 'string'
    ) {
        const anyError = error as any;

        return {
            code: anyError.code,
            message: anyError.message,
            retryable:
                typeof anyError.retryable === 'boolean'
                    ? anyError.retryable
                    : true,
            cause: anyError.cause,
        };
    }

    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
                ? error
                : 'Unknown error';

    return {
        code: RealtimeErrorCode.Unknown,
        message,
        retryable: true,
        cause: error,
    };
}

const cloneConfig = (
    config: RealtimeClientConfig,
): RealtimeClientConfig => ({
    ...config,
    protocols: config.protocols
        ? [...config.protocols]
        : config.protocols,
    metadata: config.metadata
        ? { ...config.metadata }
        : config.metadata,
    reconnect: config.reconnect
        ? {
            ...config.reconnect,
        }
        : config.reconnect,
});

const shallowEqualArray = (
    left?: string[],
    right?: string[],
): boolean => {
    const a = left ?? [];
    const b = right ?? [];

    if (a.length !== b.length) {
        return false;
    }

    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) {
            return false;
        }
    }

    return true;
};

const safeJsonEqual = (
    left: unknown,
    right: unknown,
): boolean => {
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return left === right;
    }
};

const hasStructuralClientConfigChange = (
    previous: RealtimeClientConfig,
    next: RealtimeClientConfig,
): boolean => {
    return (
        previous.url !== next.url ||
        previous.transport !== next.transport ||
        previous.connectTimeoutMs !== next.connectTimeoutMs ||
        previous.heartbeatIntervalMs !== next.heartbeatIntervalMs ||
        previous.maxIdleTimeMs !== next.maxIdleTimeMs ||
        !shallowEqualArray(previous.protocols, next.protocols) ||
        !safeJsonEqual(previous.metadata, next.metadata)
    );
};

const mergeRealtimeConfig = (
    previous: RealtimeClientConfig,
    partial: Partial<RealtimeClientConfig>,
): RealtimeClientConfig => ({
    ...previous,
    ...partial,
    protocols:
        partial.protocols !== undefined
            ? [...partial.protocols]
            : previous.protocols
                ? [...previous.protocols]
                : previous.protocols,
    metadata:
        partial.metadata !== undefined
            ? { ...(partial.metadata ?? {}) }
            : previous.metadata
                ? { ...previous.metadata }
                : previous.metadata,
    reconnect:
        partial.reconnect !== undefined
            ? partial.reconnect
                ? {
                    ...(previous.reconnect ?? {}),
                    ...partial.reconnect,
                }
                : partial.reconnect
            : previous.reconnect
                ? { ...previous.reconnect }
                : previous.reconnect,
});

export const createRealtimeConnectionManager = (
    options: RealtimeConnectionManagerOptions,
): RealtimeConnectionManager => {
    let config = cloneConfig(options.config);

    logger.info('createRealtimeConnectionManager', {
        config: sanitizeClientConfigForLog(config),
        autoConnectOverride: options.autoConnect,
    });

    let client: RealtimeClient = createRealtimeClient(config);

    let clientStateUnsubscribe: (() => void) | null = null;
    let clientErrorUnsubscribe: (() => void) | null = null;

    let attempts = 0;
    let lastError: RealtimeError | null = null;
    let lastConnectedAt: number | undefined;
    let lastDisconnectedAt: number | undefined;

    let nextAttemptAt: number | undefined;
    let lastAttemptAt: number | undefined;
    let lastDelayMs: number | undefined;

    let manualDisconnectRequested = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const subscribers = new Set<RealtimeConnectionManagerSubscriber>();
    let lastKnownState: RealtimeConnectionState = client.state;

    const reconnectConfig = () => config.reconnect;

    const clearReconnectPlan = (): void => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }

        reconnectTimer = undefined;
        nextAttemptAt = undefined;
        lastDelayMs = undefined;
    };

    const getSnapshotInternal = (): RealtimeConnectionSnapshot => {
        const reconnect = reconnectConfig();

        return {
            client,
            state: client.state,
            lastError,
            attempts,
            lastConnectedAt,
            lastDisconnectedAt,
            reconnect: reconnect
                ? {
                    enabled: Boolean(reconnect.enabled),
                    nextAttemptAt,
                    lastAttemptAt,
                    lastDelayMs,
                    attemptNumber: attempts,
                    maxAttempts: reconnect.maxAttempts,
                }
                : undefined,
        };
    };

    const notifySubscribers = (): void => {
        const snapshot = getSnapshotInternal();

        for (const subscriber of subscribers) {
            try {
                subscriber(snapshot);
            } catch {
                // ignore
            }
        }
    };

    const canAutoReconnect = (): boolean => {
        const reconnect = reconnectConfig();

        if (!reconnect?.enabled) {
            return false;
        }

        if (manualDisconnectRequested) {
            return false;
        }

        return !(Number.isFinite(reconnect.maxAttempts) &&
            reconnect.maxAttempts > 0 &&
            attempts >= reconnect.maxAttempts);


    };

    const planReconnect = (reason: string): void => {
        const reconnect = reconnectConfig();

        if (!reconnect?.enabled || !canAutoReconnect()) {
            return;
        }

        clearReconnectPlan();

        const delay = computeReconnectDelayMs(
            reconnect as Required<
                NonNullable<RealtimeClientConfig['reconnect']>
            >,
            Math.max(1, attempts),
        );

        lastDelayMs = delay;
        nextAttemptAt = Date.now() + delay;

        logger.warn('planReconnect', {
            reason,
            attempts,
            delay,
            nextAttemptAt,
        });

        reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            nextAttemptAt = undefined;

            manager
                .connect({
                    force: true,
                    reason: `auto-reconnect: ${reason}`,
                })
                .catch(() => {
                    // error already reflected in snapshot
                });
        }, delay);

        notifySubscribers();
    };

    const detachClientListeners = (): void => {
        clientStateUnsubscribe?.();
        clientErrorUnsubscribe?.();

        clientStateUnsubscribe = null;
        clientErrorUnsubscribe = null;
    };

    const attachClientListeners = (): void => {
        clientStateUnsubscribe = client.onStateChange(state => {
            const isBootstrapClosed =
                lastKnownState === RealtimeConnectionState.Closed &&
                state === RealtimeConnectionState.Closed &&
                lastConnectedAt === undefined &&
                lastDisconnectedAt === undefined &&
                attempts === 0;

            logger.info('realtime state changed', {
                from: lastKnownState,
                to: state,
                attempts,
                manualDisconnectRequested,
                isBootstrapClosed,
            });

            lastKnownState = state;

            if (isBootstrapClosed) {
                notifySubscribers();
                return;
            }

            if (state === RealtimeConnectionState.Open) {
                attempts = 0;
                lastConnectedAt = Date.now();
                lastError = null;
                manualDisconnectRequested = false;
                clearReconnectPlan();

                logger.info('realtime connected', {
                    lastConnectedAt,
                });
            }

            if (state === RealtimeConnectionState.Closed) {
                lastDisconnectedAt = Date.now();

                logger.info('realtime disconnected', {
                    lastDisconnectedAt,
                });

                if (canAutoReconnect()) {
                    planReconnect(lastError?.message ?? 'closed');
                } else {
                    clearReconnectPlan();
                }
            }

            notifySubscribers();
        });

        clientErrorUnsubscribe = client.onError(error => {
            lastError = error;

            logger.warn('realtime error', {
                code: error.code,
                message: error.message,
                retryable: error.retryable,
            });

            notifySubscribers();

            if (
                error.retryable &&
                client.state === RealtimeConnectionState.Closed &&
                canAutoReconnect()
            ) {
                planReconnect(error.message);
            }
        });
    };

    const recreateClient = (
        reason: string,
        shouldAutoConnectAfterRecreate: boolean,
    ): void => {
        const previousClient = client;

        logger.info('recreate realtime client', {
            reason,
            config: sanitizeClientConfigForLog(config),
            shouldAutoConnectAfterRecreate,
        });

        detachClientListeners();
        clearReconnectPlan();

        client = createRealtimeClient(config);
        lastKnownState = client.state;
        lastError = null;
        attempts = 0;
        manualDisconnectRequested = false;

        attachClientListeners();

        if (
            previousClient !== client &&
            previousClient.state !== RealtimeConnectionState.Closed
        ) {
            previousClient
                .disconnect(`client replaced: ${reason}`)
                .catch(() => {
                    // ignore
                });
        }

        if (shouldAutoConnectAfterRecreate) {
            manager
                .connect({
                    force: true,
                    reason: `recreated: ${reason}`,
                })
                .catch(() => {
                    // ignore
                });
        }

        notifySubscribers();
    };

    attachClientListeners();

    const manager: RealtimeConnectionManager = {
        getClient(): RealtimeClient {
            return client;
        },

        getState(): RealtimeConnectionState {
            return client.state;
        },

        getLastError(): RealtimeError | null {
            return lastError;
        },

        getSnapshot(): RealtimeConnectionSnapshot {
            return getSnapshotInternal();
        },

        async connect(
            connectOptions?: RealtimeConnectOptions,
        ): Promise<void> {
            manualDisconnectRequested = false;
            clearReconnectPlan();

            attempts += 1;
            lastAttemptAt = Date.now();

            logger.info('manager.connect', {
                attempt: attempts,
                state: client.state,
                options: connectOptions,
            });

            try {
                await client.connect(connectOptions);

                logger.debug('manager.connect resolved', {
                    attempt: attempts,
                    state: client.state,
                });
            } catch (error) {
                const realtimeError = toRealtimeError(error);
                lastError = realtimeError;

                logger.error(error, {
                    stage: 'manager.connect',
                    attempt: attempts,
                    state: client.state,
                });

                notifySubscribers();

                if (
                    realtimeError.retryable &&
                    client.state === RealtimeConnectionState.Closed &&
                    canAutoReconnect()
                ) {
                    planReconnect(realtimeError.message);
                }

                throw error;
            }
        },

        async disconnect(reason?: string): Promise<void> {
            manualDisconnectRequested = true;
            clearReconnectPlan();

            attempts = 0;
            lastError = null;

            logger.info('manager.disconnect', {
                reason,
                state: client.state,
            });

            await client.disconnect(reason);
            notifySubscribers();
        },

        updateConfig(
            partialConfig: Partial<RealtimeClientConfig>,
        ): void {
            logger.info('manager.updateConfig', {
                partialConfig: sanitizeClientConfigForLog(
                    partialConfig,
                ),
            });

            const previousConfig = config;
            const nextConfig = mergeRealtimeConfig(
                previousConfig,
                partialConfig,
            );

            const needsRecreate = hasStructuralClientConfigChange(
                previousConfig,
                nextConfig,
            );

            config = nextConfig;

            if (!config.reconnect?.enabled) {
                clearReconnectPlan();
            }

            const shouldAutoConnect =
                options.autoConnect ??
                config.autoConnect ??
                false;

            if (needsRecreate) {
                recreateClient('config updated', shouldAutoConnect);
                return;
            }

            notifySubscribers();
        },

        subscribe(
            subscriber: RealtimeConnectionManagerSubscriber,
        ): () => void {
            subscribers.add(subscriber);

            logger.debug('manager.subscribe', {
                total: subscribers.size,
            });

            try {
                subscriber(getSnapshotInternal());
            } catch {
                // ignore
            }

            return () => {
                subscribers.delete(subscriber);

                logger.debug('manager.unsubscribe', {
                    total: subscribers.size,
                });
            };
        },
    };

    const shouldAutoConnect =
        options.autoConnect ?? config.autoConnect ?? false;

    logger.info('autoConnect decision', {
        shouldAutoConnect,
        managerAutoConnectOverride: options.autoConnect,
        configAutoConnect: config.autoConnect,
    });

    if (shouldAutoConnect) {
        logger.info('autoConnect: connect() fire-and-forget');

        manager.connect({ reason: 'autoConnect' }).catch(() => {
            // state/error already reflected in snapshot
        });
    }

    return manager;
};