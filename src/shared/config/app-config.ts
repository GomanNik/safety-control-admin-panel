// =====================
// File: src/shared/config/app-config.ts
// Purpose:
// - Shared app config factory
// - Lazy default provider and lazy appConfig proxy
// - Better realtime env normalization
// =====================

import type {
    ApiConfig,
    AppConfig,
    AppConfigProvider,
    EnvironmentName,
    FeatureFlagsConfig,
    LoggingConfig,
    LogLevel,
    RealtimeConfig,
} from './types';
import type { EnvProvider } from './env';
import {
    browserEnvProvider,
    createCompositeEnvProvider,
    nodeEnvProvider,
} from './env';
import { getGlobalLogger } from '../logging';

export interface AppConfigFactoryOptions {
    envProvider: EnvProvider;
    /**
     * Переопределения/дефолты поверх вычисленных значений.
     * Применяются в самом конце.
     */
    defaults?: Partial<AppConfig>;
}

export interface AppConfigValidationIssue {
    /**
     * "Путь" до поля, которое не прошло валидацию.
     */
    path: string;
    /**
     * Краткое описание проблемы.
     */
    message: string;
}

const logger = getGlobalLogger()
    .child('shared')
    .child('config')
    .child('app-config');

const ENV_APP_ENV = 'APP_ENV';
const ENV_VITE_APP_ENV = 'VITE_APP_ENV';
const ENV_NODE_ENV = 'NODE_ENV';

const ENV_API_BASE_URL = 'API_BASE_URL';
const ENV_API_TIMEOUT_MS = 'API_TIMEOUT_MS';
const ENV_API_RETRY_COUNT = 'API_RETRY_COUNT';

const ENV_ENABLE_REALTIME = 'ENABLE_REALTIME';
const ENV_REALTIME_ENDPOINT = 'REALTIME_ENDPOINT';
const ENV_REALTIME_RECONNECT_INTERVAL_MS =
    'REALTIME_RECONNECT_INTERVAL_MS';
const ENV_REALTIME_MAX_RECONNECT_ATTEMPTS =
    'REALTIME_MAX_RECONNECT_ATTEMPTS';

const ENV_LOG_LEVEL = 'LOG_LEVEL';
const ENV_LOG_SENTRY_DSN = 'SENTRY_DSN';
const ENV_LOG_CONSOLE_ENABLED = 'LOG_CONSOLE_ENABLED';

const ENV_FEATURE_USE_MOCKS = 'USE_MOCKS';

const ENV_APP_VERSION = 'APP_VERSION';
const ENV_BUILD_TIME = 'APP_BUILD_TIME';

function normalizeEnvName(raw: string | undefined): EnvironmentName {
    const value = (raw ?? '').trim().toLowerCase();

    if (value === 'prod' || value === 'production') {
        return 'production';
    }

    if (value === 'test' || value === 'testing') {
        return 'test';
    }

    if (value === 'stage' || value === 'staging') {
        return 'staging';
    }

    return 'development';
}

function resolveEnvironmentName(
    envProvider: EnvProvider,
    fallback?: EnvironmentName,
): { env: EnvironmentName; source?: string; raw?: string } {
    const byAppEnv = envProvider.get(ENV_APP_ENV);

    if (byAppEnv) {
        return {
            env: normalizeEnvName(byAppEnv),
            source: ENV_APP_ENV,
            raw: byAppEnv,
        };
    }

    const byVite = envProvider.get(ENV_VITE_APP_ENV);

    if (byVite) {
        return {
            env: normalizeEnvName(byVite),
            source: ENV_VITE_APP_ENV,
            raw: byVite,
        };
    }

    const byNode = envProvider.get(ENV_NODE_ENV);

    if (byNode) {
        return {
            env: normalizeEnvName(byNode),
            source: ENV_NODE_ENV,
            raw: byNode,
        };
    }

    if (fallback) {
        return {
            env: fallback,
            source: 'defaults.env',
        };
    }

    return {
        env: 'development',
    };
}

function parseBoolean(
    value: string | undefined,
    defaultValue: boolean,
): boolean {
    if (value == null) {
        return defaultValue;
    }

    const normalized = value.trim().toLowerCase();

    if (
        normalized === '1' ||
        normalized === 'true' ||
        normalized === 'yes' ||
        normalized === 'on'
    ) {
        return true;
    }

    if (
        normalized === '0' ||
        normalized === 'false' ||
        normalized === 'no' ||
        normalized === 'off'
    ) {
        return false;
    }

    return defaultValue;
}

function parseNumber(
    value: string | undefined,
    defaultValue: number,
): number {
    if (value == null || value.trim() === '') {
        return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        return defaultValue;
    }

    return parsed;
}

function parseLogLevel(
    value: string | undefined,
    defaultLevel: LogLevel,
): LogLevel {
    if (!value) {
        return defaultLevel;
    }

    const normalized = value.trim().toLowerCase();
    const allowed: LogLevel[] = [
        'debug',
        'info',
        'warn',
        'error',
        'silent',
    ];

    if ((allowed as string[]).includes(normalized)) {
        return normalized as LogLevel;
    }

    return defaultLevel;
}

const normalizeNonEmptyString = (
    value: string | undefined,
): string | undefined => {
    if (value == null) {
        return undefined;
    }

    const normalized = value.trim();

    return normalized === '' ? undefined : normalized;
};

const normalizeApiBaseUrl = (
    value: string | undefined,
): string | undefined => {
    const normalized = normalizeNonEmptyString(value);

    if (!normalized) {
        return undefined;
    }

    return normalized.replace(/\/+$/, '');
};

const normalizeRealtimeEndpoint = (
    value: string | undefined,
): string | undefined => {
    const normalized = normalizeNonEmptyString(value);

    if (!normalized) {
        return undefined;
    }

    return normalized;
};

const sanitizeUrlForLogs = (
    value: string | undefined,
): string | undefined => {
    if (!value) {
        return value;
    }

    const raw = String(value).trim();

    if (!raw) {
        return raw;
    }

    const withoutQuery = raw.split('#')[0].split('?')[0];

    try {
        if (
            withoutQuery.startsWith('http://') ||
            withoutQuery.startsWith('https://') ||
            withoutQuery.startsWith('ws://') ||
            withoutQuery.startsWith('wss://')
        ) {
            const parsed = new URL(withoutQuery);
            parsed.username = '';
            parsed.password = '';

            return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        }
    } catch {
        // ignore
    }

    return withoutQuery;
};

const logConfigOnceKeys = new Set<string>();

const logConfigOnce = (
    key: string,
    meta: Record<string, unknown>,
): void => {
    if (logConfigOnceKeys.has(key)) {
        return;
    }

    logConfigOnceKeys.add(key);
    logger.info('app config ready', meta);
};

/**
 * Базовая конфигурация, зависящая только от env.
 */
function getBaseConfig(env: EnvironmentName): AppConfig {
    const apiBaseUrl =
        env === 'production' || env === 'staging'
            ? '/api'
            : 'http://localhost:3000/api';

    const realtimeEndpoint =
        env === 'production' || env === 'staging'
            ? '/realtime'
            : 'ws://localhost:3000/realtime';

    const api: ApiConfig = {
        baseUrl: apiBaseUrl,
        timeoutMs: 15_000,
        retryCount: env === 'production' ? 2 : 0,
    };

    const realtime: RealtimeConfig = {
        enabled: env !== 'test',
        endpointUrl: realtimeEndpoint,
        reconnectIntervalMs: 5_000,
        maxReconnectAttempts: 10,
    };

    const logging: LoggingConfig = {
        level: env === 'production' ? 'info' : 'debug',
        consoleEnabled: env !== 'production',
        sentryDsn: undefined,
    };

    const features: FeatureFlagsConfig = {
        ENABLE_REALTIME: env !== 'test',
        USE_MOCKS: env === 'development',
        IS_DEV: env === 'development',
        IS_TEST: env === 'test',
        IS_STAGING: env === 'staging',
        IS_PROD: env === 'production',
    };

    return {
        env,
        api,
        realtime,
        logging,
        features,
        appVersion: undefined,
        buildTime: undefined,
    };
}

function applyEnvOverrides(
    envProvider: EnvProvider,
    config: AppConfig,
): AppConfig {
    const get = (key: string) => envProvider.get(key);

    const api: ApiConfig = {
        ...config.api,
        baseUrl:
            normalizeApiBaseUrl(get(ENV_API_BASE_URL)) ??
            config.api.baseUrl,
        timeoutMs: parseNumber(
            get(ENV_API_TIMEOUT_MS),
            config.api.timeoutMs,
        ),
        retryCount: parseNumber(
            get(ENV_API_RETRY_COUNT),
            config.api.retryCount,
        ),
    };

    const realtime: RealtimeConfig = {
        ...config.realtime,
        enabled: parseBoolean(
            get(ENV_ENABLE_REALTIME),
            config.realtime.enabled,
        ),
        endpointUrl:
            normalizeRealtimeEndpoint(get(ENV_REALTIME_ENDPOINT)) ??
            config.realtime.endpointUrl,
        reconnectIntervalMs: parseNumber(
            get(ENV_REALTIME_RECONNECT_INTERVAL_MS),
            config.realtime.reconnectIntervalMs,
        ),
        maxReconnectAttempts: parseNumber(
            get(ENV_REALTIME_MAX_RECONNECT_ATTEMPTS),
            config.realtime.maxReconnectAttempts,
        ),
    };

    const logging: LoggingConfig = {
        ...config.logging,
        level: parseLogLevel(
            get(ENV_LOG_LEVEL),
            config.logging.level,
        ),
        consoleEnabled: parseBoolean(
            get(ENV_LOG_CONSOLE_ENABLED),
            config.logging.consoleEnabled,
        ),
        sentryDsn:
            normalizeNonEmptyString(get(ENV_LOG_SENTRY_DSN)) ??
            config.logging.sentryDsn,
    };

    const features: FeatureFlagsConfig = {
        ...config.features,
        ENABLE_REALTIME: parseBoolean(
            get(ENV_ENABLE_REALTIME),
            config.features.ENABLE_REALTIME,
        ),
        USE_MOCKS: parseBoolean(
            get(ENV_FEATURE_USE_MOCKS),
            config.features.USE_MOCKS,
        ),
        IS_DEV: config.features.IS_DEV,
        IS_TEST: config.features.IS_TEST,
        IS_STAGING: config.features.IS_STAGING,
        IS_PROD: config.features.IS_PROD,
    };

    const appVersion =
        normalizeNonEmptyString(get(ENV_APP_VERSION)) ??
        config.appVersion;

    const buildTime =
        normalizeNonEmptyString(get(ENV_BUILD_TIME)) ??
        config.buildTime;

    return {
        ...config,
        api,
        realtime,
        logging,
        features,
        appVersion,
        buildTime,
    };
}

function mergeWithDefaults(
    base: AppConfig,
    defaults?: Partial<AppConfig>,
): AppConfig {
    if (!defaults) {
        return base;
    }

    return {
        ...base,
        ...defaults,
        api: {
            ...base.api,
            ...(defaults.api ?? {}),
        },
        realtime: {
            ...base.realtime,
            ...(defaults.realtime ?? {}),
        },
        logging: {
            ...base.logging,
            ...(defaults.logging ?? {}),
        },
        features: {
            ...base.features,
            ...(defaults.features ?? {}),
        },
    };
}

export const validateAppConfig = (
    config: AppConfig,
): AppConfigValidationIssue[] => {
    const issues: AppConfigValidationIssue[] = [];

    if (!config.api.baseUrl || config.api.baseUrl.trim() === '') {
        issues.push({
            path: 'api.baseUrl',
            message: 'API baseUrl должен быть непустой строкой',
        });
    }

    if (
        !Number.isFinite(config.api.timeoutMs) ||
        config.api.timeoutMs <= 0
    ) {
        issues.push({
            path: 'api.timeoutMs',
            message: 'API timeoutMs должен быть положительным числом',
        });
    }

    if (
        !Number.isFinite(config.api.retryCount) ||
        config.api.retryCount < 0
    ) {
        issues.push({
            path: 'api.retryCount',
            message: 'API retryCount не может быть отрицательным',
        });
    }

    if (config.realtime.enabled) {
        if (
            !config.realtime.endpointUrl ||
            config.realtime.endpointUrl.trim() === ''
        ) {
            issues.push({
                path: 'realtime.endpointUrl',
                message:
                    'При включённом realtime endpointUrl должен быть непустой строкой',
            });
        }

        if (
            !Number.isFinite(config.realtime.reconnectIntervalMs) ||
            config.realtime.reconnectIntervalMs <= 0
        ) {
            issues.push({
                path: 'realtime.reconnectIntervalMs',
                message:
                    'realtime.reconnectIntervalMs должен быть положительным числом',
            });
        }

        if (
            !Number.isFinite(
                config.realtime.maxReconnectAttempts,
            ) ||
            config.realtime.maxReconnectAttempts < 0
        ) {
            issues.push({
                path: 'realtime.maxReconnectAttempts',
                message:
                    'realtime.maxReconnectAttempts не может быть отрицательным',
            });
        }
    }

    const allowedLogLevels: LogLevel[] = [
        'debug',
        'info',
        'warn',
        'error',
        'silent',
    ];

    if (!allowedLogLevels.includes(config.logging.level)) {
        issues.push({
            path: 'logging.level',
            message:
                `logging.level должен быть одним из: ` +
                `${allowedLogLevels.join(', ')}`,
        });
    }

    return issues;
};

export const assertValidAppConfig = (
    config: AppConfig,
): void => {
    const issues = validateAppConfig(config);

    if (issues.length === 0) {
        return;
    }

    const messageLines = issues.map(
        issue => ` - ${issue.path}: ${issue.message}`,
    );

    throw new Error(
        `Invalid AppConfig:\n${messageLines.join('\n')}`,
    );
};

export const createAppConfig = (
    options: AppConfigFactoryOptions,
): AppConfig => {
    const envResolved = resolveEnvironmentName(
        options.envProvider,
        options.defaults?.env,
    );

    const base = getBaseConfig(envResolved.env);
    const withEnv = applyEnvOverrides(options.envProvider, base);
    const merged = mergeWithDefaults(withEnv, options.defaults);

    assertValidAppConfig(merged);

    const safeMeta = {
        env: merged.env,
        envSource: envResolved.source,
        api: {
            baseUrl: sanitizeUrlForLogs(merged.api.baseUrl),
            timeoutMs: merged.api.timeoutMs,
            retryCount: merged.api.retryCount,
        },
        realtime: {
            enabled: merged.realtime.enabled,
            endpointUrl: sanitizeUrlForLogs(
                merged.realtime.endpointUrl,
            ),
            reconnectIntervalMs:
                merged.realtime.reconnectIntervalMs,
            maxReconnectAttempts:
                merged.realtime.maxReconnectAttempts,
        },
        logging: {
            level: merged.logging.level,
            consoleEnabled: merged.logging.consoleEnabled,
            hasSentryDsn: Boolean(merged.logging.sentryDsn),
        },
        features: merged.features,
        appVersion: merged.appVersion,
        buildTime: merged.buildTime,
    };

    const logKey = [
        merged.env,
        safeMeta.api.baseUrl,
        merged.api.timeoutMs,
        merged.api.retryCount,
        merged.realtime.enabled,
        safeMeta.realtime.endpointUrl,
        merged.realtime.reconnectIntervalMs,
        merged.realtime.maxReconnectAttempts,
        merged.logging.level,
        merged.logging.consoleEnabled,
        merged.features.ENABLE_REALTIME,
        merged.features.USE_MOCKS,
        merged.appVersion,
        merged.buildTime,
    ].join('|');

    logConfigOnce(logKey, safeMeta);

    return merged;
};

const createLazyAppConfigProvider = (
    factory: () => AppConfig,
): AppConfigProvider => {
    let cache: AppConfig | null = null;

    const resolve = (): AppConfig => {
        if (cache) {
            return cache;
        }

        cache = factory();
        return cache;
    };

    return {
        getConfig(): AppConfig {
            return resolve();
        },
        getEnvName(): EnvironmentName {
            return resolve().env;
        },
    };
};

export const createAppConfigProvider = (
    options: AppConfigFactoryOptions,
): AppConfigProvider => {
    return createLazyAppConfigProvider(() =>
        createAppConfig(options),
    );
};

export const defaultEnvProvider: EnvProvider =
    createCompositeEnvProvider([
        {
            name: 'browser',
            get: key => browserEnvProvider.get(key),
        },
        {
            name: 'node',
            get: key => nodeEnvProvider.get(key),
        },
    ]);

export const defaultAppConfigProvider: AppConfigProvider =
    createLazyAppConfigProvider(() =>
        createAppConfig({
            envProvider: defaultEnvProvider,
        }),
    );

const getDefaultAppConfig = (): AppConfig =>
    defaultAppConfigProvider.getConfig();

/**
 * Ленивый proxy вместо eager import-time snapshot.
 */
export const appConfig: AppConfig = new Proxy(
    {} as AppConfig,
    {
        get(_target, property, receiver) {
            return Reflect.get(
                getDefaultAppConfig() as unknown as object,
                property,
                receiver,
            );
        },
        has(_target, property) {
            return property in
                (getDefaultAppConfig() as unknown as object);
        },
        ownKeys() {
            return Reflect.ownKeys(
                getDefaultAppConfig() as unknown as object,
            );
        },
        getOwnPropertyDescriptor(_target, property) {
            const descriptor = Object.getOwnPropertyDescriptor(
                getDefaultAppConfig() as unknown as object,
                property,
            );

            if (!descriptor) {
                return undefined;
            }

            return {
                ...descriptor,
                configurable: true,
            };
        },
    },
) as AppConfig;