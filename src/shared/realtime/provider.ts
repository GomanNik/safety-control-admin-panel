// =====================
// shared/realtime/provider.ts
// =====================

import type { ReactElement, ReactNode } from 'react';
import {
    createContext,
    createElement,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import type {
    RealtimeConnectionManager,
    RealtimeConnectionSnapshot,
} from './connection-manager';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger().child('shared').child('realtime').child('provider');

export interface RealtimeContextValue {
    manager: RealtimeConnectionManager;
    snapshot: RealtimeConnectionSnapshot;
}

export interface RealtimeProviderProps {
    /**
     * Готовый менеджер соединения.
     */
    manager: RealtimeConnectionManager;

    children: ReactNode;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(
    undefined,
);

export const RealtimeProvider = (
    props: RealtimeProviderProps,
): ReactElement => {
    const { manager, children } = props;

    const [snapshot, setSnapshot] = useState<RealtimeConnectionSnapshot>(
        () => manager.getSnapshot(),
    );

    useEffect(() => {
        logger.info('RealtimeProvider mounted', {
            state: manager.getState(),
        });

        const unsub = manager.subscribe(next => {
            setSnapshot(next);
        });

        return () => {
            try {
                unsub();
            } finally {
                logger.info('RealtimeProvider unmounted');
            }
        };
    }, [manager]);

    const value = useMemo<RealtimeContextValue>(
        () => ({
            manager,
            snapshot,
        }),
        [manager, snapshot],
    );

    return createElement(
        RealtimeContext.Provider,
        { value },
        children,
    );
};

export const useRealtimeContext = (): RealtimeContextValue => {
    const ctx = useContext(RealtimeContext);
    if (!ctx) {
        logger.error('useRealtimeContext called outside RealtimeProvider');
        throw new Error(
            'useRealtimeContext must be used within RealtimeProvider',
        );
    }
    return ctx;
};
