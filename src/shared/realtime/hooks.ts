// =====================
// File: src/shared/realtime/hooks.ts
// Purpose:
// - Realtime React hooks
// - Expose concise accessors without debug-only noise
// =====================

import type { RealtimeClient } from './client';
import type {
    RealtimeConnectionManager,
    RealtimeConnectionSnapshot,
    RealtimeReconnectSnapshot,
} from './connection-manager';
import { RealtimeConnectionState } from './types';
import type { RealtimeError } from './types';
import { useRealtimeContext } from './provider';

export interface UseRealtimeConnectionResult {
    manager: RealtimeConnectionManager;
    client: RealtimeClient;
    state: RealtimeConnectionState;
    lastError: RealtimeError | null;
    attempts: number;
    lastConnectedAt?: number;
    lastDisconnectedAt?: number;
    reconnect?: RealtimeReconnectSnapshot;
}

export const useRealtimeConnection =
    (): UseRealtimeConnectionResult => {
        const { manager, snapshot } = useRealtimeContext();

        return {
            manager,
            client: snapshot.client,
            state: snapshot.state,
            lastError: snapshot.lastError,
            attempts: snapshot.attempts,
            lastConnectedAt: snapshot.lastConnectedAt,
            lastDisconnectedAt:
            snapshot.lastDisconnectedAt,
            reconnect: snapshot.reconnect,
        };
    };

export const useRealtimeSnapshot =
    (): RealtimeConnectionSnapshot => {
        return useRealtimeContext().snapshot;
    };

export const useRealtimeClient =
    (): RealtimeClient => {
        return useRealtimeContext().snapshot.client;
    };