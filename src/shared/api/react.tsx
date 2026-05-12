// =====================
// File: src/shared/api/react.tsx
// Purpose:
// - Shared API React bindings
// - Memoized domain client factory result
// =====================

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
} from 'react';
import type {
    ReactElement,
    ReactNode,
} from 'react';
import type { HttpClient } from './http-client';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger()
    .child('shared')
    .child('api')
    .child('react');

export interface ApiContextValue {
    httpClient: HttpClient;
}

export interface ApiProviderProps {
    /**
     * Готовый экземпляр HttpClient.
     * Рекомендуется создавать его один раз в composition-root.
     */
    client: HttpClient;
    children: ReactNode;
}

const ApiContext = createContext<ApiContextValue | undefined>(undefined);

export const ApiProvider = (props: ApiProviderProps): ReactElement => {
    const { client, children } = props;

    useEffect(() => {
        logger.info('ApiProvider mounted');

        return () => {
            logger.info('ApiProvider unmounted');
        };
    }, []);

    return (
        <ApiContext.Provider value={{ httpClient: client }}>
            {children}
        </ApiContext.Provider>
    );
};

export const useHttpClient = (): HttpClient => {
    const ctx = useContext(ApiContext);

    if (!ctx) {
        logger.error('useHttpClient called outside ApiProvider');
        throw new Error('useHttpClient must be used within ApiProvider');
    }

    return ctx.httpClient;
};

export const useApiClient = <TClient,>(
    factory: (httpClient: HttpClient) => TClient,
): TClient => {
    const httpClient = useHttpClient();

    return useMemo(() => {
        logger.debug('useApiClient factory invoked', {
            factoryName: factory?.name || 'anonymous',
        });

        return factory(httpClient);
    }, [factory, httpClient]);
};