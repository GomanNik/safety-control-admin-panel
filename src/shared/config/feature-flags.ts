// =====================
// File: src/shared/config/feature-flags.ts
// Purpose:
// - Resolve normalized feature flags from AppConfig
// - Expose the final feature flags for the current build
// - Keep only the minimal public API actually worth using
// =====================

import { appConfig } from './app-config';
import type {
    AppConfig,
    FeatureFlagsConfig,
} from './types';

const normalizeFeatureFlags = (
    config: AppConfig,
): FeatureFlagsConfig => {
    const env = config.env;
    const base: Partial<FeatureFlagsConfig> =
        config.features ?? {};

    const isDev = env === 'development';
    const isTest = env === 'test';
    const isStaging = env === 'staging';
    const isProd = env === 'production';

    return {
        ...base,
        IS_DEV: isDev,
        IS_TEST: isTest,
        IS_STAGING: isStaging,
        IS_PROD: isProd,
        ENABLE_REALTIME:
            base.ENABLE_REALTIME ?? !isTest,
        USE_MOCKS:
            base.USE_MOCKS ?? isDev,
    };
};

/**
 * Универсальная нормализация фич-флагов
 * для произвольного AppConfig.
 */
export const resolveFeatureFlags = (
    config: AppConfig,
): FeatureFlagsConfig => {
    return normalizeFeatureFlags(config);
};

/**
 * Глобальный набор фич-флагов
 * для текущей сборки.
 */
export const featureFlags: FeatureFlagsConfig =
    resolveFeatureFlags(appConfig);