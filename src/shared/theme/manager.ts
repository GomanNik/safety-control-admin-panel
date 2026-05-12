// =====================
// File: src/shared/theme/manager.ts
// Purpose:
// - Shared theme manager
// - Runtime listeners are now lazy and tied to active subscribers
// =====================

import { getGlobalLogger } from '../logging';
import type {
    ResolvedThemeMode,
    ThemeConfig,
    ThemeDefinition,
    ThemeMode,
    ThemeName,
} from './types';

export interface ThemeManagerOptions {
    config: ThemeConfig;
    storageKey?: string;
    storage?: ThemeStorage | null;
}

export interface ThemeManagerSubscriber {
    (
        theme: ThemeDefinition,
        mode: ThemeMode,
        resolvedMode: ResolvedThemeMode,
    ): void;
}

export interface ThemeManager {
    getTheme(): ThemeDefinition;
    getMode(): ThemeMode;
    getResolvedMode(): ResolvedThemeMode;
    getConfig(): ThemeConfig;

    setTheme(name: ThemeName): void;
    setMode(mode: ThemeMode): void;

    subscribe(subscriber: ThemeManagerSubscriber): () => void;
}

export interface ThemeStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface PersistedThemeState {
    themeName: ThemeName;
    mode: ThemeMode;
}

type ThemeManagerInitSource = 'storage' | 'default';

interface ThemeManagerInitialState {
    state: PersistedThemeState;
    source: ThemeManagerInitSource;
}

interface LegacyMediaQueryListApi {
    addListener?: (
        listener: (event: MediaQueryListEvent) => void,
    ) => void;
    removeListener?: (
        listener: (event: MediaQueryListEvent) => void,
    ) => void;
}

const DEFAULT_STORAGE_KEY = 'app_theme';

const getThemeManagerLogger = () => {
    return getGlobalLogger()
        .child('shared')
        .child('theme')
        .child('manager');
};

const isBrowserEnv = (): boolean => {
    return (
        typeof window !== 'undefined' &&
        typeof window.localStorage !== 'undefined'
    );
};

const isValidMode = (value: unknown): value is ThemeMode => {
    return (
        value === 'light' ||
        value === 'dark' ||
        value === 'system'
    );
};

const ensureThemesNotEmpty = (
    config: ThemeConfig,
): void => {
    if (!Array.isArray(config.themes) || config.themes.length === 0) {
        const error = new Error(
            '[ThemeManager] ThemeConfig must contain at least one theme definition.',
        );

        getThemeManagerLogger().error(error, {
            action: 'ensureThemesNotEmpty',
        });

        throw error;
    }
};

const resolveStorage = (
    storage?: ThemeStorage | null,
): ThemeStorage | null => {
    if (storage) {
        return storage;
    }

    if (!isBrowserEnv()) {
        return null;
    }

    return window.localStorage;
};

const parsePersistedThemeState = (
    raw: string,
): PersistedThemeState | null => {
    try {
        const parsed = JSON.parse(raw) as {
            themeName?: unknown;
            mode?: unknown;
        };

        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const themeName =
            typeof parsed.themeName === 'string'
                ? (parsed.themeName as ThemeName)
                : null;

        const mode = isValidMode(parsed.mode)
            ? parsed.mode
            : null;

        if (!themeName || !mode) {
            return null;
        }

        return {
            themeName,
            mode,
        };
    } catch {
        return null;
    }
};

const safeReadFromStorage = (
    key: string,
    storage?: ThemeStorage | null,
): PersistedThemeState | null => {
    const effectiveStorage = resolveStorage(storage);

    if (!effectiveStorage) {
        return null;
    }

    try {
        const raw = effectiveStorage.getItem(key);

        if (!raw) {
            return null;
        }

        return parsePersistedThemeState(raw);
    } catch (error) {
        getThemeManagerLogger().warn(
            'Failed to read theme state from storage',
            {
                storageKey: key,
                error,
            },
        );

        return null;
    }
};

const safeWriteToStorage = (
    key: string,
    state: PersistedThemeState,
    storage?: ThemeStorage | null,
): void => {
    const effectiveStorage = resolveStorage(storage);

    if (!effectiveStorage) {
        return;
    }

    try {
        effectiveStorage.setItem(
            key,
            JSON.stringify({
                themeName: state.themeName,
                mode: state.mode,
            }),
        );
    } catch (error) {
        getThemeManagerLogger().warn(
            'Failed to persist theme state to storage',
            {
                storageKey: key,
                state,
                error,
            },
        );
    }
};

const getDefaultTheme = (
    config: ThemeConfig,
): ThemeDefinition => {
    const configuredDefault = config.themes.find(
        theme => theme.name === config.defaultTheme,
    );

    return configuredDefault ?? config.themes[0];
};

const findThemeByName = (
    config: ThemeConfig,
    name: ThemeName,
): ThemeDefinition => {
    const exact = config.themes.find(
        theme => theme.name === name,
    );

    return exact ?? getDefaultTheme(config);
};

const getSystemPreferredMode = (): ResolvedThemeMode => {
    if (
        typeof window === 'undefined' ||
        typeof window.matchMedia !== 'function'
    ) {
        return 'light';
    }

    return window.matchMedia(
        '(prefers-color-scheme: dark)',
    ).matches
        ? 'dark'
        : 'light';
};

const resolveThemeName = (
    config: ThemeConfig,
    preferredThemeName?: ThemeName,
): ThemeName => {
    if (!preferredThemeName) {
        return getDefaultTheme(config).name;
    }

    const existing = config.themes.find(
        theme => theme.name === preferredThemeName,
    );

    return existing?.name ?? getDefaultTheme(config).name;
};

const resolveInitialState = (
    config: ThemeConfig,
    storageKey: string,
    storage?: ThemeStorage | null,
): ThemeManagerInitialState => {
    ensureThemesNotEmpty(config);

    const persistedState = safeReadFromStorage(
        storageKey,
        storage,
    );

    if (persistedState) {
        return {
            source: 'storage',
            state: {
                themeName: resolveThemeName(
                    config,
                    persistedState.themeName,
                ),
                mode: persistedState.mode,
            },
        };
    }

    const defaultMode: ThemeMode = isValidMode(config.defaultMode)
        ? config.defaultMode
        : 'light';

    return {
        source: 'default',
        state: {
            themeName: getDefaultTheme(config).name,
            mode: defaultMode,
        },
    };
};

export const createThemeManager = (
    options: ThemeManagerOptions,
): ThemeManager => {
    const config = options.config;
    const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    const storage = options.storage ?? null;

    ensureThemesNotEmpty(config);

    const initial = resolveInitialState(
        config,
        storageKey,
        storage,
    );

    let currentThemeName: ThemeName = initial.state.themeName;
    let currentMode: ThemeMode = initial.state.mode;

    const subscribers = new Set<ThemeManagerSubscriber>();

    let unsubscribeSystemListener: (() => void) | null = null;
    let unsubscribeStorageListener: (() => void) | null = null;

    const getCurrentTheme = (): ThemeDefinition => {
        return findThemeByName(config, currentThemeName);
    };

    const getResolvedMode = (): ResolvedThemeMode => {
        return currentMode === 'system'
            ? getSystemPreferredMode()
            : currentMode;
    };

    const getCurrentPersistedState = (): PersistedThemeState => {
        return {
            themeName: currentThemeName,
            mode: currentMode,
        };
    };

    const isSameState = (
        next: PersistedThemeState,
    ): boolean => {
        return (
            currentThemeName === next.themeName &&
            currentMode === next.mode
        );
    };

    const persist = (): void => {
        safeWriteToStorage(
            storageKey,
            getCurrentPersistedState(),
            storage,
        );
    };

    const notifySubscribers = (): void => {
        const theme = getCurrentTheme();
        const resolvedMode = getResolvedMode();

        subscribers.forEach(subscriber => {
            try {
                subscriber(theme, currentMode, resolvedMode);
            } catch (error) {
                getThemeManagerLogger().error(error, {
                    action: 'notifySubscribers',
                    themeName: theme.name,
                    mode: currentMode,
                    resolvedMode,
                });
            }
        });
    };

    const stopSystemListener = (): void => {
        if (unsubscribeSystemListener) {
            unsubscribeSystemListener();
            unsubscribeSystemListener = null;

            getThemeManagerLogger().debug(
                'System theme listener stopped',
            );
        }
    };

    const startSystemListener = (): void => {
        if (
            typeof window === 'undefined' ||
            typeof window.matchMedia !== 'function'
        ) {
            return;
        }

        if (unsubscribeSystemListener) {
            return;
        }

        const nextMediaQueryList = window.matchMedia(
            '(prefers-color-scheme: dark)',
        );

        const handleChange = (): void => {
            if (currentMode !== 'system') {
                return;
            }

            notifySubscribers();

            getThemeManagerLogger().info(
                'Resolved mode synchronized with system preference',
                {
                    themeName: currentThemeName,
                    mode: currentMode,
                    resolvedMode: getResolvedMode(),
                },
            );
        };

        if (
            typeof nextMediaQueryList.addEventListener ===
            'function'
        ) {
            nextMediaQueryList.addEventListener(
                'change',
                handleChange,
            );

            unsubscribeSystemListener = () => {
                nextMediaQueryList.removeEventListener(
                    'change',
                    handleChange,
                );
            };

            getThemeManagerLogger().debug(
                'System theme listener started',
                {
                    api: 'addEventListener',
                },
            );

            return;
        }

        const legacyApi =
            nextMediaQueryList as unknown as LegacyMediaQueryListApi;

        if (typeof legacyApi.addListener === 'function') {
            legacyApi.addListener(handleChange);

            unsubscribeSystemListener = () => {
                legacyApi.removeListener?.(handleChange);
            };

            getThemeManagerLogger().debug(
                'System theme listener started',
                {
                    api: 'addListener',
                },
            );
        }
    };

    const stopStorageListener = (): void => {
        if (
            typeof window === 'undefined' ||
            !unsubscribeStorageListener
        ) {
            return;
        }

        unsubscribeStorageListener();
        unsubscribeStorageListener = null;

        getThemeManagerLogger().debug(
            'Theme storage listener stopped',
            {
                storageKey,
            },
        );
    };

    const startStorageListener = (): void => {
        if (
            typeof window === 'undefined' ||
            unsubscribeStorageListener
        ) {
            return;
        }

        const handleStorage = (
            event: StorageEvent,
        ): void => {
            if (event.key !== storageKey) {
                return;
            }

            const nextRaw = event.newValue;

            if (!nextRaw) {
                return;
            }

            const parsed = parsePersistedThemeState(nextRaw);

            if (!parsed) {
                getThemeManagerLogger().warn(
                    'Theme storage sync skipped because payload is invalid',
                    {
                        storageKey,
                        raw: nextRaw,
                    },
                );
                return;
            }

            applyState(parsed, {
                source: 'storage',
                requestedThemeName: parsed.themeName,
                requestedMode: parsed.mode,
            });
        };

        window.addEventListener('storage', handleStorage);

        unsubscribeStorageListener = () => {
            window.removeEventListener(
                'storage',
                handleStorage,
            );
        };

        getThemeManagerLogger().debug(
            'Theme storage listener started',
            {
                storageKey,
            },
        );
    };

    const syncRuntimeListeners = (): void => {
        const hasSubscribers = subscribers.size > 0;

        if (!hasSubscribers) {
            stopSystemListener();
            stopStorageListener();
            return;
        }

        startStorageListener();

        if (currentMode === 'system') {
            startSystemListener();
        } else {
            stopSystemListener();
        }
    };

    const applyState = (
        nextState: PersistedThemeState,
        meta: {
            source: 'storage' | 'setTheme' | 'setMode';
            requestedThemeName?: ThemeName;
            requestedMode?: ThemeMode;
        },
    ): void => {
        const normalizedThemeName = resolveThemeName(
            config,
            nextState.themeName,
        );

        const normalizedState: PersistedThemeState = {
            themeName: normalizedThemeName,
            mode: isValidMode(nextState.mode)
                ? nextState.mode
                : currentMode,
        };

        if (isSameState(normalizedState)) {
            getThemeManagerLogger().debug(
                'Theme state apply skipped because state is unchanged',
                {
                    source: meta.source,
                    themeName: currentThemeName,
                    mode: currentMode,
                    resolvedMode: getResolvedMode(),
                },
            );
            return;
        }

        const previousThemeName = currentThemeName;
        const previousMode = currentMode;
        const previousResolvedMode = getResolvedMode();

        currentThemeName = normalizedState.themeName;
        currentMode = normalizedState.mode;

        syncRuntimeListeners();

        if (meta.source !== 'storage') {
            persist();
        }

        notifySubscribers();

        if (meta.source === 'storage') {
            getThemeManagerLogger().info(
                'Theme state synced from storage',
                {
                    storageKey,
                    previousThemeName,
                    previousMode,
                    previousResolvedMode,
                    requestedThemeName:
                    meta.requestedThemeName,
                    requestedMode: meta.requestedMode,
                    themeName: currentThemeName,
                    mode: currentMode,
                    resolvedMode: getResolvedMode(),
                },
            );

            return;
        }

        if (meta.source === 'setTheme') {
            getThemeManagerLogger().info(
                'Theme changed',
                {
                    previousThemeName,
                    previousMode,
                    previousResolvedMode,
                    requestedThemeName:
                    meta.requestedThemeName,
                    themeName: currentThemeName,
                    mode: currentMode,
                    resolvedMode: getResolvedMode(),
                },
            );

            return;
        }

        getThemeManagerLogger().info(
            'Theme mode changed',
            {
                previousThemeName,
                previousMode,
                previousResolvedMode,
                requestedMode: meta.requestedMode,
                themeName: currentThemeName,
                mode: currentMode,
                resolvedMode: getResolvedMode(),
            },
        );
    };

    getThemeManagerLogger().info(
        'ThemeManager initialized',
        {
            source: initial.source,
            storageKey,
            themeName: currentThemeName,
            mode: currentMode,
            resolvedMode: getResolvedMode(),
            availableThemes: config.themes.map(theme => ({
                name: theme.name,
            })),
        },
    );

    return {
        getTheme(): ThemeDefinition {
            return getCurrentTheme();
        },

        getMode(): ThemeMode {
            return currentMode;
        },

        getResolvedMode(): ResolvedThemeMode {
            return getResolvedMode();
        },

        getConfig(): ThemeConfig {
            return config;
        },

        setTheme(name: ThemeName): void {
            applyState(
                {
                    themeName: name,
                    mode: currentMode,
                },
                {
                    source: 'setTheme',
                    requestedThemeName: name,
                },
            );
        },

        setMode(mode: ThemeMode): void {
            const nextMode = isValidMode(mode)
                ? mode
                : currentMode;

            applyState(
                {
                    themeName: currentThemeName,
                    mode: nextMode,
                },
                {
                    source: 'setMode',
                    requestedMode: mode,
                },
            );
        },

        subscribe(
            subscriber: ThemeManagerSubscriber,
        ): () => void {
            subscribers.add(subscriber);
            syncRuntimeListeners();

            try {
                subscriber(
                    getCurrentTheme(),
                    currentMode,
                    getResolvedMode(),
                );
            } catch (error) {
                getThemeManagerLogger().error(error, {
                    action: 'subscribe.initialCall',
                    themeName: currentThemeName,
                    mode: currentMode,
                    resolvedMode: getResolvedMode(),
                });
            }

            getThemeManagerLogger().debug(
                'Theme subscriber added',
                {
                    subscribersCount: subscribers.size,
                    themeName: currentThemeName,
                    mode: currentMode,
                    resolvedMode: getResolvedMode(),
                },
            );

            return () => {
                subscribers.delete(subscriber);
                syncRuntimeListeners();

                getThemeManagerLogger().debug(
                    'Theme subscriber removed',
                    {
                        subscribersCount: subscribers.size,
                        themeName: currentThemeName,
                        mode: currentMode,
                        resolvedMode: getResolvedMode(),
                    },
                );
            };
        },
    };
};