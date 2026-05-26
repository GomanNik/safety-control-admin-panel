// =====================
// shared/realtime/types.ts
// =====================

export type RealtimeTransport = 'ws' | 'sse';

/**
 * Состояние низкоуровневого соединения.
 */
export enum RealtimeConnectionState {
    Connecting = 'connecting',
    Open = 'open',
    Closing = 'closing',
    Closed = 'closed',
}

/**
 * Код ошибки для реалтайм-уровня.
 * Позволяет не завязываться на конкретную библиотеку WebSocket/SSE.
 */
export enum RealtimeErrorCode {
    Transport = 'transport',
    Unknown = 'unknown',
}

/**
 * Описание ошибки реалтайм-клиента.
 */
export interface RealtimeError {
    code: RealtimeErrorCode;
    message: string;
    /**
     * Может ли операция быть повторена автоматически.
     */
    retryable: boolean;
    /**
     * Низкоуровневая причина (WebSocket ошибка, текст, и т.п.).
     */
    cause?: unknown;
}

/**
 * Имя канала (topic / room / stream).
 */
export type RealtimeChannelName = string;

/**
 * Тип события внутри канала.
 */
export type RealtimeEventName = string;

/**
 * Общее событие, приходящее из транспортного слоя.
 */
export interface RealtimeEvent<TPayload = unknown> {
    /**
     * Логический тип события (например, "incident.created").
     */
    type: RealtimeEventName;
    /**
     * Содержимое события.
     */
    payload: TPayload;
    /**
     * Момент времени на стороне сервера (unix ms или ISO, по договорённости).
     */
    timestamp: number;
    /**
     * Опциональное имя канала, если транспорт его предоставляет.
     */
    channel?: RealtimeChannelName;
    /**
     * Сырые данные для отладки (JSON-строка, объект и т.п.).
     */
    raw?: unknown;
}

/**
 * Настройки подписки.
 */
export interface RealtimeSubscribeOptions {
    /**
     * Список типов событий, которые интересны подписчику.
     * Если не задан — подписчик получает все события канала.
     */
    eventTypes?: string[];
    /**
     * Размер внутреннего буфера (если реализация буферизует события).
     */
    bufferSize?: number;
    /**
     * Должна ли подписка автоматически восстанавливаться при реконнекте.
     */
    autoResubscribeOnReconnect?: boolean;
    /**
     * Ключ для "долговечной" подписки (например, для реплея пропущенных событий).
     */
    durableKey?: string;
}

/**
 * Обработчик отдельного события.
 */
export type RealtimeEventHandler<TPayload = unknown> = (
    event: RealtimeEvent<TPayload>,
) => void;

/**
 * Слушатель изменения состояния соединения.
 */
export type RealtimeStateChangeListener = (
    state: RealtimeConnectionState,
) => void;

/**
 * Слушатель ошибок уровня соединения.
 */
export type RealtimeErrorListener = (error: RealtimeError) => void;

/**
 * Конфигурация стратегии реконнекта.
 */
export interface RealtimeReconnectConfig {
    /**
     * Включён ли реконнект вообще.
     */
    enabled: boolean;
    /**
     * Максимальное число попыток подряд. 0/Infinity — без ограничения.
     */
    maxAttempts: number;
    /**
     * Начальный интервал между попытками (мс).
     */
    initialDelayMs: number;
    /**
     * Верхняя граница интервала между попытками (мс).
     */
    maxDelayMs: number;
    /**
     * Множитель экспоненциальной задержки.
     */
    multiplier: number;
    /**
     * Доля джиттера (0–1). 0 — без джиттера.
     */
    jitterRatio?: number;
}

/**
 * Базовая конфигурация реалтайм-клиента.
 */
export interface RealtimeClientConfig {
    url: string;
    transport: RealtimeTransport;
    /**
     * Опциональные протоколы WebSocket (subprotocols).
     */
    protocols?: string[];
    /**
     * Настройки реконнекта.
     */
    reconnect?: RealtimeReconnectConfig;

    /**
     * Интервал heartbeat/ping (мс). 0/undefined — реализация решает сама.
     */
    heartbeatIntervalMs?: number;
    /**
     * Максимальное время без активных подписок, после которого соединение
     * может быть автоматически закрыто реализацией.
     */
    maxIdleTimeMs?: number;
    /**
     * Таймаут установления соединения (мс).
     */
    connectTimeoutMs?: number;
    /**
     * Автоподключение при создании клиента.
     */
    autoConnect?: boolean;
    /**
     * Включить дополнительный лог.
     */
    debug?: boolean;
    /**
     * Произвольные метаданные для адаптеров/логирования.
     */
    metadata?: Record<string, unknown>;
}

/**
 * Дополнительные опции connect(), которые не относятся к статической конфигурации.
 */
export interface RealtimeConnectOptions {
    /**
     * Форсировать переподключение, даже если соединение уже открыто.
     */
    force?: boolean;
    /**
     * Причина переподключения — удобно для логов и отладки.
     */
    reason?: string;
}

/**
 * Карта каналов → тип полезной нагрузки.
 * Можно переопределить на уровне приложения для более строгой типизации.
 */
export type RealtimeChannelMap = Record<string, unknown>;
