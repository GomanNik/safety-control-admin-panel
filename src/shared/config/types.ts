// =====================
// shared/config/types.ts
// =====================

export type EnvironmentName = 'development' | 'test' | 'staging' | 'production';

export interface ApiConfig {
    baseUrl: string;
    timeoutMs: number;
    retryCount: number;
}

export interface RealtimeConfig {
    enabled: boolean;
    endpointUrl: string;
    reconnectIntervalMs: number;
    maxReconnectAttempts: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LoggingConfig {
    level: LogLevel;
    sentryDsn?: string;
    consoleEnabled: boolean;
}

export interface FeatureFlagsConfig {
    /**
     * Включён ли realtime по умолчанию.
     */
    ENABLE_REALTIME: boolean;

    /**
     * Использовать ли моки вместо реальных запросов.
     */
    USE_MOCKS: boolean;

    /**
     * Удобный алиас для env === 'development'.
     * Держим его и в фиче-флагах, чтобы проще читать в рантайме.
     */
    IS_DEV: boolean;
    IS_TEST?: boolean;
    IS_STAGING?: boolean;
    IS_PROD?: boolean;

    /**
     * Расширяемый словарь флагов.
     */
    [flagName: string]: boolean | undefined;
}

export interface AppConfig {
    env: EnvironmentName;
    api: ApiConfig;
    realtime: RealtimeConfig;
    logging: LoggingConfig;
    features: FeatureFlagsConfig;
    /**
     * Версия приложения (например, git-tag или semver).
     */
    appVersion?: string;
    /**
     * Время сборки (строка, чтобы не тащить Date в рантайм).
     */
    buildTime?: string;
}

export interface AppConfigProvider {
    getConfig(): AppConfig;
    getEnvName(): EnvironmentName;
}