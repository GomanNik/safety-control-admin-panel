// =====================
// shared/realtime/transports/ws-client.ts
// =====================

import { getGlobalLogger } from '../../logging';
import type {
    RealtimeChannelMap,
    RealtimeClientConfig,
    RealtimeConnectOptions, RealtimeError,
    RealtimeErrorListener,
    RealtimeEvent,
    RealtimeEventHandler,
    RealtimeStateChangeListener,
    RealtimeSubscribeOptions,
} from '../types';

import type { RealtimeClient, RealtimeSubscription } from '../client';
import { RealtimeConnectionState, RealtimeErrorCode } from '../types';
import { resolveClientDialUrl } from '../utils/resolveUrl';

const logger = getGlobalLogger().child('shared').child('realtime').child('ws-client');

type SubRecord = {
    channel: string;
    handler: RealtimeEventHandler<any>;
    eventTypes?: string[];
    options?: RealtimeSubscribeOptions;
    isUnsubscribed: boolean;
};

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof WebSocket !== 'undefined';
}

function nowMs(): number {
    return Date.now();
}

function makeError(params: {
    code: RealtimeErrorCode;
    message: string;
    retryable: boolean;
    cause?: unknown;
}): RealtimeError {
    return {
        code: params.code,
        message: params.message,
        retryable: params.retryable,
        cause: params.cause,
    };
}

/**
 * Поддерживаем 2 формата входящих сообщений:
 * A) RealtimeEvent: { type, payload, timestamp, channel? }
 * B) Envelope: { channel, event: { type, payload, timestamp } }
 */
function parseInbound(raw: unknown): RealtimeEvent | null {
    const obj =
        typeof raw === 'string'
            ? (() => {
                try {
                    return JSON.parse(raw);
                } catch {
                    return null;
                }
            })()
            : raw;

    if (!obj || typeof obj !== 'object') return null;

    const anyObj = obj as any;

    // Envelope
    if (anyObj.event && typeof anyObj.event === 'object') {
        const ev = anyObj.event as any;
        const type = typeof ev.type === 'string' ? ev.type : undefined;
        if (!type) return null;

        return {
            type,
            payload: ev.payload,
            timestamp: typeof ev.timestamp === 'number' ? ev.timestamp : nowMs(),
            channel: typeof anyObj.channel === 'string' ? anyObj.channel : ev.channel,
            raw,
        };
    }

    // Direct event
    const type = typeof anyObj.type === 'string' ? anyObj.type : undefined;
    if (!type) return null;

    return {
        type,
        payload: anyObj.payload,
        timestamp: typeof anyObj.timestamp === 'number' ? anyObj.timestamp : nowMs(),
        channel: typeof anyObj.channel === 'string' ? anyObj.channel : undefined,
        raw,
    };
}

export const createWsRealtimeClient = <
    TChannels extends RealtimeChannelMap = RealtimeChannelMap,
>(
    config: RealtimeClientConfig,
): RealtimeClient<TChannels> => {
    if (!isBrowser()) {
        logger.warn('createWsRealtimeClient called вне браузера — fallback to noop expectations');
    }

    const stateListeners = new Set<RealtimeStateChangeListener>();
    const errorListeners = new Set<RealtimeErrorListener>();
    const eventListeners = new Set<RealtimeEventHandler>();

    const subs = new Set<SubRecord>();

    let socket: WebSocket | null = null;

    let state: RealtimeConnectionState = RealtimeConnectionState.Closed;
    let lastError: RealtimeError | null = null;

    let connectPromise: Promise<void> | null = null;

    const dialUrl = () => resolveClientDialUrl(config);

    const notifyState = (next: RealtimeConnectionState) => {
        state = next;
        for (const l of stateListeners) {
            try {
                l(next);
            } catch {
                // ignore
            }
        }
    };

    const notifyError = (err: RealtimeError) => {
        lastError = err;
        for (const l of errorListeners) {
            try {
                l(err);
            } catch {
                // ignore
            }
        }
    };

    const dispatchEvent = (ev: RealtimeEvent) => {
        // global listeners
        for (const h of eventListeners) {
            try {
                h(ev);
            } catch {
                // ignore
            }
        }

        // channel subscriptions
        for (const s of subs) {
            if (s.isUnsubscribed) continue;
            if (s.channel !== (ev.channel ?? s.channel)) {
                // если event без channel — считаем, что это "общий" и шлём только тем, кто подписан на '*'
                if (!(s.channel === '*' && !ev.channel)) continue;
                if (ev.channel && s.channel !== '*' && s.channel !== ev.channel) continue;
            }

            if (Array.isArray(s.eventTypes) && s.eventTypes.length > 0) {
                if (!s.eventTypes.includes(ev.type)) continue;
            }

            try {
                s.handler(ev);
            } catch {
                // ignore
            }
        }
    };

    const safeCloseSocket = (reason?: string) => {
        if (!socket) return;
        try {
            logger.info('ws close()', { reason });
            socket.close(1000, reason?.slice(0, 120));
        } catch {
            // ignore
        } finally {
            socket = null;
        }
    };

    const connect = async (options?: RealtimeConnectOptions): Promise<void> => {
        if (!isBrowser()) {
            const err = makeError({
                code: RealtimeErrorCode.Transport,
                message: 'WebSocket недоступен в текущем окружении',
                retryable: false,
            });
            notifyError(err);
            notifyState(RealtimeConnectionState.Closed);
            throw new Error(err.message);
        }

        const force = Boolean(options?.force);

        // Уже подключены
        if (state === RealtimeConnectionState.Open && !force) return;

        // Уже коннектимся — отдаём тот же промис
        if (state === RealtimeConnectionState.Connecting && connectPromise) {
            return connectPromise;
        }

        // Форс: закрываем прошлый сокет
        if (force) safeCloseSocket('force reconnect');

        notifyState(RealtimeConnectionState.Connecting);

        const url = dialUrl();

        const timeoutMs = Math.max(1_000, config.connectTimeoutMs ?? 10_000);

        connectPromise = new Promise<void>((resolve, reject) => {
            let settled = false;

            logger.info('ws connect()', {
                url,
                protocols: config.protocols,
                timeoutMs,
            });

            let timeoutId: ReturnType<typeof setTimeout> | undefined;

            const finalize = (ok: boolean, err?: unknown) => {
                if (settled) return;
                settled = true;

                if (timeoutId) clearTimeout(timeoutId);
                connectPromise = null;

                if (ok) resolve();
                else reject(err);
            };

            try {
                socket = config.protocols?.length
                    ? new WebSocket(url, config.protocols)
                    : new WebSocket(url);
            } catch (e) {
                notifyState(RealtimeConnectionState.Closed);
                const err = makeError({
                    code: RealtimeErrorCode.Transport,
                    message: 'Не удалось создать WebSocket',
                    retryable: true,
                    cause: e,
                });
                notifyError(err);
                finalize(false, e);
                return;
            }

            timeoutId = setTimeout(() => {
                const err = makeError({
                    code: RealtimeErrorCode.Transport,
                    message: `Таймаут подключения (${timeoutMs}ms)`,
                    retryable: true,
                });
                notifyError(err);
                safeCloseSocket('connect timeout');
                notifyState(RealtimeConnectionState.Closed);
                finalize(false, new Error(err.message));
            }, timeoutMs);

            socket.onopen = () => {
                logger.info('ws open');
                lastError = null;
                notifyState(RealtimeConnectionState.Open);
                finalize(true);
            };

            socket.onmessage = (msg) => {
                const ev = parseInbound(msg.data);
                if (!ev) return;

                dispatchEvent(ev);
            };

            socket.onerror = (e) => {
                // В браузере onerror почти без деталей, но фиксируем transport error
                const err = makeError({
                    code: RealtimeErrorCode.Transport,
                    message: 'WebSocket error',
                    retryable: true,
                    cause: e,
                });
                notifyError(err);
            };

            socket.onclose = (ev) => {
                logger.info('ws close', {
                    code: ev.code,
                    reason: ev.reason,
                    wasClean: ev.wasClean,
                });

                socket = null;

                // Если закрылись до open — считаем провалом connect()
                if (state === RealtimeConnectionState.Connecting) {
                    const err = makeError({
                        code: RealtimeErrorCode.Transport,
                        message: `Соединение закрыто до открытия (code=${ev.code})`,
                        retryable: true,
                        cause: ev,
                    });
                    notifyError(err);
                    notifyState(RealtimeConnectionState.Closed);
                    finalize(false, new Error(err.message));
                    return;
                }

                notifyState(RealtimeConnectionState.Closed);
            };
        });

        return connectPromise;
    };

    const disconnect = async (reason?: string): Promise<void> => {
        if (state === RealtimeConnectionState.Closed) return;

        notifyState(RealtimeConnectionState.Closing);

        safeCloseSocket(reason ?? 'disconnect');

        notifyState(RealtimeConnectionState.Closed);
    };

    const subscribe = <
        TChannel extends keyof TChannels & string,
        TPayload = TChannels[TChannel],
    >(
        channel: TChannel,
        handler: RealtimeEventHandler<TPayload>,
        options?: RealtimeSubscribeOptions,
    ): RealtimeSubscription => {
        const rec: SubRecord = {
            channel,
            handler: handler as RealtimeEventHandler<any>,
            eventTypes: options?.eventTypes,
            options,
            isUnsubscribed: false,
        };

        subs.add(rec);

        return {
            channel,
            eventTypes: options?.eventTypes,
            get isActive() {
                return state === RealtimeConnectionState.Open;
            },
            unsubscribe(): void {
                if (rec.isUnsubscribed) return;
                rec.isUnsubscribed = true;
                subs.delete(rec);
            },
        };
    };

    const emit = <
        TChannel extends keyof TChannels & string,
        TPayload = TChannels[TChannel],
    >(
        channel: TChannel,
        event: RealtimeEvent<TPayload>,
    ): void => {
        if (!socket || state !== RealtimeConnectionState.Open) return;

        const payload = JSON.stringify({
            channel,
            type: event.type,
            payload: event.payload,
            timestamp: event.timestamp ?? nowMs(),
        });

        try {
            socket.send(payload);
        } catch (e) {
            const err = makeError({
                code: RealtimeErrorCode.Transport,
                message: 'Не удалось отправить сообщение',
                retryable: true,
                cause: e,
            });
            notifyError(err);
        }
    };

    const onStateChange = (listener: RealtimeStateChangeListener): (() => void) => {
        stateListeners.add(listener);

        // мгновенно отдаём текущее состояние
        try {
            listener(state);
        } catch {
            // ignore
        }

        return () => stateListeners.delete(listener);
    };

    const onError = (listener: RealtimeErrorListener): (() => void) => {
        errorListeners.add(listener);
        return () => errorListeners.delete(listener);
    };

    const onEvent = <TPayload = unknown>(handler: RealtimeEventHandler<TPayload>): (() => void) => {
        eventListeners.add(handler as RealtimeEventHandler);
        return () => eventListeners.delete(handler as RealtimeEventHandler);
    };

    return {
        config,

        get state() {
            return state;
        },

        get lastError() {
            return lastError;
        },

        connect,
        disconnect,

        subscribe,
        emit,

        onStateChange,
        onError,
        onEvent,
    };
};
