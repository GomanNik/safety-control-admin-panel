// =====================
// File: src/shared/logging/logger.ts
// Purpose:
// - Shared logger factory
// - Dynamic global logger proxy to avoid stale fallback capture
// =====================

import type {
    AppConfig,
    EnvironmentName,
    LoggingConfig,
    LogLevel,
} from '../config';

const LOG_LEVEL_ORDER: LogLevel[] = [
    'debug',
    'info',
    'warn',
    'error',
    'silent',
];

const getLevelIndex = (level: LogLevel): number =>
    LOG_LEVEL_ORDER.indexOf(level);

/**
 * Внешний репортёр ошибок (например, Sentry).
 * Реализация живёт вне shared/logging, сюда прокидывается как зависимость.
 */
export interface ExternalErrorReporter {
    captureException(error: unknown, context?: Record<string, unknown>): void;
}

export interface Logger {
    debug(message: string, details?: unknown): void;
    info(message: string, details?: unknown): void;
    warn(message: string, details?: unknown): void;
    error(errorOrMessage: unknown, details?: unknown): void;
    child(scope: string): Logger;
}

export interface LoggerOptions {
    /**
     * Конфигурация логирования из AppConfig.logging.
     */
    config: LoggingConfig;
    /**
     * Текущее окружение (development/test/staging/production).
     * Используется только для префиксов — поведения не меняет.
     */
    env?: EnvironmentName;
    /**
     * Необязательный глобальный scope.
     */
    scope?: string;
    /**
     * Внешний репортёр ошибок (например, Sentry).
     */
    errorReporter?: ExternalErrorReporter;
}

/**
 * Опции для создания логгера на основе всего AppConfig.
 */
export interface LoggerFromAppConfigOptions
    extends Omit<LoggerOptions, 'config' | 'env'> {
    scope?: string;
}

/**
 * Проверка, нужно ли логировать сообщение заданного уровня
 * при текущей конфигурации.
 */
const shouldLog = (config: LoggingConfig, level: LogLevel): boolean => {
    if (config.level === 'silent') {
        return false;
    }

    const currentIndex = getLevelIndex(config.level);
    const requestedIndex = getLevelIndex(level);

    if (currentIndex === -1 || requestedIndex === -1) {
        return false;
    }

    return requestedIndex >= currentIndex;
};

const selectConsoleMethod = (
    level: LogLevel,
): ((...args: unknown[]) => void) => {
    if (typeof console === 'undefined') {
        return () => {};
    }

    switch (level) {
        case 'debug':
            return console.debug
                ? console.debug.bind(console)
                : console.log.bind(console);
        case 'info':
            return console.info
                ? console.info.bind(console)
                : console.log.bind(console);
        case 'warn':
            return console.warn
                ? console.warn.bind(console)
                : console.log.bind(console);
        case 'error':
            return console.error
                ? console.error.bind(console)
                : console.log.bind(console);
        case 'silent':
        default:
            return () => {};
    }
};

const formatPrefix = (options: {
    env?: EnvironmentName;
    scope?: string;
}): string => {
    const parts: string[] = [];

    if (options.env) {
        parts.push(`[${options.env}]`);
    }
    if (options.scope && options.scope.trim() !== '') {
        parts.push(`[${options.scope}]`);
    }

    return parts.length > 0 ? `${parts.join('')} ` : '';
};

const createLoggerInternal = (options: LoggerOptions): Logger => {
    const { config, env, errorReporter } = options;
    const scope = options.scope;

    const prefix = formatPrefix({ env, scope });

    const logImpl = (
        level: LogLevel,
        message: string,
        details?: unknown,
        maybeError?: unknown,
    ): void => {
        if (!shouldLog(config, level)) {
            return;
        }

        if (config.consoleEnabled) {
            const consoleMethod = selectConsoleMethod(level);

            if (details !== undefined) {
                consoleMethod(`${prefix}${message}`, details);
            } else {
                consoleMethod(`${prefix}${message}`);
            }

            if (level === 'error' && maybeError && maybeError !== details) {
                consoleMethod(`${prefix}[error-object]`, maybeError);
            }
        }

        if (level === 'error' && errorReporter) {
            const errorObject =
                maybeError instanceof Error
                    ? maybeError
                    : details instanceof Error
                        ? details
                        : new Error(message);

            const context: Record<string, unknown> = {
                level,
                message,
                env,
                scope,
            };

            if (details !== undefined && !(details instanceof Error)) {
                context.details = details;
            }

            errorReporter.captureException(errorObject, context);
        }
    };

    return {
        debug(message: string, details?: unknown): void {
            logImpl('debug', message, details);
        },
        info(message: string, details?: unknown): void {
            logImpl('info', message, details);
        },
        warn(message: string, details?: unknown): void {
            logImpl('warn', message, details);
        },
        error(errorOrMessage: unknown, details?: unknown): void {
            let message: string;
            let errorObject: unknown = undefined;

            if (errorOrMessage instanceof Error) {
                message = errorOrMessage.message;
                errorObject = errorOrMessage;
            } else {
                message = String(errorOrMessage);
                if (details instanceof Error) {
                    errorObject = details;
                }
            }

            logImpl('error', message, details, errorObject);
        },
        child(childScope: string): Logger {
            const combinedScope =
                scope && scope.trim() !== ''
                    ? `${scope}:${childScope}`
                    : childScope;

            return createLoggerInternal({
                config,
                env,
                errorReporter,
                scope: combinedScope,
            });
        },
    };
};

export const createLogger = (options: LoggerOptions): Logger =>
    createLoggerInternal(options);

export const createLoggerFromAppConfig = (
    appConfig: AppConfig,
    options?: LoggerFromAppConfigOptions,
): Logger => {
    return createLoggerInternal({
        config: appConfig.logging,
        env: appConfig.env,
        scope: options?.scope,
        errorReporter: options?.errorReporter,
    });
};

// ===== Глобальный логгер =====

const fallbackConfig: LoggingConfig = {
    level: 'info',
    consoleEnabled: true,
    sentryDsn: undefined,
};

const fallbackRootLogger: Logger = createLoggerInternal({
    config: fallbackConfig,
    env: undefined,
    scope: 'global',
    errorReporter: undefined,
});

let configuredGlobalLogger: Logger | null = null;

const resolveRootLogger = (): Logger =>
    configuredGlobalLogger ?? fallbackRootLogger;

const resolveScopedLogger = (scopePath: string[]): Logger => {
    let logger = resolveRootLogger();

    for (const scopePart of scopePath) {
        if (!scopePart) {
            continue;
        }

        logger = logger.child(scopePart);
    }

    return logger;
};

const createProxyLogger = (scopePath: string[] = []): Logger => ({
    debug(message: string, details?: unknown): void {
        resolveScopedLogger(scopePath).debug(message, details);
    },
    info(message: string, details?: unknown): void {
        resolveScopedLogger(scopePath).info(message, details);
    },
    warn(message: string, details?: unknown): void {
        resolveScopedLogger(scopePath).warn(message, details);
    },
    error(errorOrMessage: unknown, details?: unknown): void {
        resolveScopedLogger(scopePath).error(errorOrMessage, details);
    },
    child(scope: string): Logger {
        const normalized = String(scope ?? '').trim();

        if (!normalized) {
            return createProxyLogger(scopePath);
        }

        return createProxyLogger([...scopePath, normalized]);
    },
});

/**
 * Устанавливает глобальный логгер.
 * Все уже созданные proxy-логгеры автоматически начнут писать в него.
 */
export const setGlobalLogger = (logger: Logger | null): void => {
    configuredGlobalLogger = logger;
};

/**
 * Возвращает proxy-логгер, который лениво резолвит
 * актуальный глобальный логгер на каждый вызов.
 */
export const getGlobalLogger = (): Logger => {
    return createProxyLogger();
};