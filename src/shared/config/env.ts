// =====================
// File: src/shared/config/env.ts
// Purpose:
// - Shared env providers
// - Composite provider now skips empty values, not only undefined
// =====================

export type EnvGetter = (key: string) => string | undefined;

export interface EnvProvider {
    get(key: string): string | undefined;
}

export interface EnvSourceDescriptor {
    name: string;
    get: EnvGetter;
}

declare global {
    interface Window {
        __APP_ENV__?: Record<string, unknown>;
    }
}

const browserGetter: EnvGetter = (key: string): string | undefined => {
    if (typeof window === 'undefined') {
        return undefined;
    }

    const env = window.__APP_ENV__;
    if (!env) {
        return undefined;
    }

    const value = env[key];
    if (value == null) {
        return undefined;
    }

    return typeof value === 'string' ? value : String(value);
};

export const browserEnvProvider: EnvProvider = {
    get(key: string): string | undefined {
        return browserGetter(key);
    },
};

const nodeGetter: EnvGetter = (key: string): string | undefined => {
    const globalAny: any =
        typeof globalThis !== 'undefined'
            ? globalThis
            : undefined;

    const env = globalAny?.process?.env as
        | Record<string, unknown>
        | undefined;

    if (!env) {
        return undefined;
    }

    const value = env[key];

    if (typeof value === 'string') {
        return value;
    }

    return value != null ? String(value) : undefined;
};

export const nodeEnvProvider: EnvProvider = {
    get(key: string): string | undefined {
        return nodeGetter(key);
    },
};

/**
 * Композитный провайдер:
 * итерируется по источникам по порядку
 * и возвращает первое найденное непустое значение.
 */
export const createCompositeEnvProvider = (
    sources: EnvSourceDescriptor[],
): EnvProvider => ({
    get(key: string): string | undefined {
        for (const source of sources) {
            const value = source.get(key);

            if (value === undefined) {
                continue;
            }

            if (typeof value === 'string' && value.trim() === '') {
                continue;
            }

            return value;
        }

        return undefined;
    },
});