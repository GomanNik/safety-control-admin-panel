// =====================
// File: src/shared/realtime/client.ts
// Purpose:
// - Shared realtime client factory
// - Stable noop fallback and transport selection
// =====================

import {
    RealtimeChannelMap,
    RealtimeClientConfig,
    RealtimeConnectOptions,
    RealtimeConnectionState,
    RealtimeError,
    RealtimeErrorListener,
    RealtimeEvent,
    RealtimeEventHandler,
    RealtimeStateChangeListener,
    RealtimeSubscribeOptions,
} from './types';
import { getGlobalLogger } from '../logging';
import { createWsRealtimeClient } from './transports/ws-client';

const logger = getGlobalLogger()
    .child('shared')
    .child('realtime')
    .child('client');

export interface RealtimeSubscription {
    readonly channel: string;
    readonly eventTypes?: string[];
    readonly isActive: boolean;
    unsubscribe(): void;
}

export interface RealtimeClient<
    TChannels extends RealtimeChannelMap = RealtimeChannelMap,
> {
    readonly config: RealtimeClientConfig;
    readonly state: RealtimeConnectionState;
    readonly lastError: RealtimeError | null;

    connect(options?: RealtimeConnectOptions): Promise<void>;
    disconnect(reason?: string): Promise<void>;

    subscribe<
        TChannel extends keyof TChannels & string,
        TPayload = TChannels[TChannel],
    >(
        channel: TChannel,
        handler: RealtimeEventHandler<TPayload>,
        options?: RealtimeSubscribeOptions,
    ): RealtimeSubscription;

    emit<
        TChannel extends keyof TChannels & string,
        TPayload = TChannels[TChannel],
    >(
        channel: TChannel,
        event: RealtimeEvent<TPayload>,
    ): void;

    onStateChange(listener: RealtimeStateChangeListener): () => void;
    onError(listener: RealtimeErrorListener): () => void;
    onEvent<TPayload = unknown>(
        handler: RealtimeEventHandler<TPayload>,
    ): () => void;
}

export const createNoopRealtimeClient = <
    TChannels extends RealtimeChannelMap = RealtimeChannelMap,
>(
    config: RealtimeClientConfig,
): RealtimeClient<TChannels> => {
    const subscriptions = new Set<RealtimeSubscription>();
    const stateChangeListeners =
        new Set<RealtimeStateChangeListener>();
    const errorListeners = new Set<RealtimeErrorListener>();
    const eventListeners = new Set<RealtimeEventHandler>();

    const snapshotState: {
        state: RealtimeConnectionState;
        lastError: RealtimeError | null;
    } = {
        state: RealtimeConnectionState.Closed,
        lastError: null,
    };

    logger.info('createNoopRealtimeClient', {
        url: config.url,
        transport: config.transport,
        autoConnect: config.autoConnect,
        debug: config.debug,
    });

    const notifyStateChange = (): void => {
        for (const listener of stateChangeListeners) {
            try {
                listener(snapshotState.state);
            } catch {
                // ignore
            }
        }
    };

    return {
        config,

        get state() {
            return snapshotState.state;
        },

        get lastError() {
            return snapshotState.lastError;
        },

        async connect(
            options?: RealtimeConnectOptions,
        ): Promise<void> {
            logger.debug('noop.connect called', {
                state: snapshotState.state,
                options,
            });

            notifyStateChange();
        },

        async disconnect(reason?: string): Promise<void> {
            logger.debug('noop.disconnect called', {
                state: snapshotState.state,
                reason,
            });

            notifyStateChange();
        },

        subscribe<
            TChannel extends keyof TChannels & string,
            TPayload = TChannels[TChannel],
        >(
            channel: TChannel,
            _handler: RealtimeEventHandler<TPayload>,
            options?: RealtimeSubscribeOptions,
        ): RealtimeSubscription {
            logger.debug('noop.subscribe', {
                channel,
                eventTypes: options?.eventTypes,
                autoResubscribeOnReconnect:
                    options?.autoResubscribeOnReconnect,
                durableKey: options?.durableKey,
            });

            let isUnsubscribed = false;

            const sub: RealtimeSubscription = {
                channel,
                eventTypes: options?.eventTypes,
                get isActive() {
                    return false;
                },
                unsubscribe(): void {
                    if (isUnsubscribed) {
                        return;
                    }

                    isUnsubscribed = true;
                    subscriptions.delete(sub);
                },
            };

            subscriptions.add(sub);
            return sub;
        },

        emit<
            TChannel extends keyof TChannels & string,
            TPayload = TChannels[TChannel],
        >(
            channel: TChannel,
            event: RealtimeEvent<TPayload>,
        ): void {
            logger.debug('noop.emit', {
                channel,
                type: event?.type,
                timestamp: event?.timestamp,
            });
        },

        onStateChange(
            listener: RealtimeStateChangeListener,
        ): () => void {
            stateChangeListeners.add(listener);

            try {
                listener(snapshotState.state);
            } catch {
                // ignore
            }

            return () => {
                stateChangeListeners.delete(listener);
            };
        },

        onError(
            listener: RealtimeErrorListener,
        ): () => void {
            errorListeners.add(listener);

            return () => {
                errorListeners.delete(listener);
            };
        },

        onEvent<TPayload = unknown>(
            handler: RealtimeEventHandler<TPayload>,
        ): () => void {
            eventListeners.add(
                handler as unknown as RealtimeEventHandler,
            );

            return () => {
                eventListeners.delete(
                    handler as unknown as RealtimeEventHandler,
                );
            };
        },
    };
};

export const createRealtimeClient = <
    TChannels extends RealtimeChannelMap = RealtimeChannelMap,
>(
    config: RealtimeClientConfig,
): RealtimeClient<TChannels> => {
    logger.info('createRealtimeClient', {
        url: config.url,
        transport: config.transport,
        autoConnect: config.autoConnect,
        debug: config.debug,
    });

    if (!config.url || !config.transport) {
        return createNoopRealtimeClient<TChannels>(config);
    }

    if (config.transport === 'ws') {
        return createWsRealtimeClient<TChannels>(config);
    }

    logger.warn(
        'Unsupported realtime transport, falling back to noop',
        {
            transport: config.transport,
        },
    );

    return createNoopRealtimeClient<TChannels>(config);
};