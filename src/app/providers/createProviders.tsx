// =====================
// src/app/providers/createProviders.tsx
// =====================

import type { JSX, ReactNode } from 'react';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    QueryClient,
    QueryClientProvider,
} from '@tanstack/react-query';

import * as api from '../../shared/api';
import {
    i18n,
    I18nProvider,
} from '../../shared/i18n';
import {
    RealtimeProvider,
    createRealtimeConnectionManager,
} from '../../shared/realtime';
import type { RealtimeClientConfig } from '../../shared/realtime';
import type {
    ThemeConfig,
    ThemeContextValue,
    ThemeMode,
    ThemeName,
} from '../../shared/theme';
import {
    ThemeProvider,
    createThemeManager,
    defaultTheme,
} from '../../shared/theme';

type Props = {
    children: ReactNode;
};

type ApiProviderComponent = (
    props: {
        children: ReactNode;
        client?: api.HttpClient;
        httpClient?: api.HttpClient;
    } & Record<string, unknown>,
) => JSX.Element;

function resolveApiProvider(): ApiProviderComponent | null {
    const anyApi = api as Record<string, unknown>;

    return (
        (anyApi.ApiProvider as ApiProviderComponent | undefined) ??
        (anyApi.HttpClientProvider as ApiProviderComponent | undefined) ??
        (anyApi.ApiClientProvider as ApiProviderComponent | undefined) ??
        null
    );
}

const RESOLVED_API_PROVIDER = resolveApiProvider();

const THEME_CONFIG: ThemeConfig = {
    defaultTheme: 'default',
    defaultMode: 'light',
    themes: [defaultTheme],
};

const DEFAULT_REALTIME_CONFIG: RealtimeClientConfig = {
    url: '',
    transport: 'ws',
    autoConnect: false,
    debug: false,
    connectTimeoutMs: 10_000,
    reconnect: {
        enabled: false,
        maxAttempts: 0,
        initialDelayMs: 1_000,
        maxDelayMs: 1_000,
        multiplier: 1,
        jitterRatio: 0,
    },
};

export function RootProviders({
                                  children,
                              }: Props): JSX.Element {
    const [httpClient] = useState(() => api.createHttpClient({
        timeoutMs: 15_000,
        retryPolicy: {
            maxRetries: 1,
            baseDelayMs: 250,
            backoffMultiplier: 2,
            maxDelayMs: 2_000,
        },
    }));

    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                retry: 1,
                refetchOnWindowFocus: false,
            },
            mutations: {
                retry: 0,
            },
        },
    }));

    const [themeManager] = useState(() => createThemeManager({
        config: THEME_CONFIG,
    }));

    const [realtimeManager] = useState(() => createRealtimeConnectionManager({
        config: DEFAULT_REALTIME_CONFIG,
        autoConnect: false,
    }));

    const [themeState, setThemeState] = useState(() => ({
        theme: themeManager.getTheme(),
        mode: themeManager.getMode(),
        resolvedMode: themeManager.getResolvedMode(),
    }));

    useEffect(() => {
        return themeManager.subscribe((theme, mode, resolvedMode) => {
            setThemeState((prev) => {
                if (
                    prev.theme.name === theme.name &&
                    prev.mode === mode &&
                    prev.resolvedMode === resolvedMode
                ) {
                    return prev;
                }

                return {
                    theme,
                    mode,
                    resolvedMode,
                };
            });
        });
    }, [themeManager]);

    const setTheme = useCallback((name: ThemeName): void => {
        themeManager.setTheme(name);
    }, [themeManager]);

    const setMode = useCallback((mode: ThemeMode): void => {
        themeManager.setMode(mode);
    }, [themeManager]);

    const themeValue = useMemo<ThemeContextValue>(() => ({
        theme: themeState.theme,
        mode: themeState.mode,
        resolvedMode: themeState.resolvedMode,
        availableThemes: THEME_CONFIG.themes,
        setTheme,
        setMode,
    }), [
        setMode,
        setTheme,
        themeState.mode,
        themeState.resolvedMode,
        themeState.theme,
    ]);

    const content = RESOLVED_API_PROVIDER ? (
        <RESOLVED_API_PROVIDER
            client={httpClient}
            httpClient={httpClient}
        >
            {children}
        </RESOLVED_API_PROVIDER>
    ) : (
        children
    );

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider value={themeValue}>
                <I18nProvider instance={i18n}>
                    <RealtimeProvider manager={realtimeManager}>
                        {content}
                    </RealtimeProvider>
                </I18nProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}