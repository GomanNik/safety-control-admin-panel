// =====================
// entities/incident/store-hooks.ts
// =====================

import { useSyncExternalStore } from 'react';

import type {
    IncidentUIState,
    IncidentUIStore,
} from './store';
import type { IncidentListFilters } from './types';
import type { IncidentId } from '../../shared/api';

import { getGlobalLogger } from '../../shared/logging';

const logger = getGlobalLogger()
    .child('entities')
    .child('incident')
    .child('store');

const now = (): number => Date.now();

function createDefaultFilters(): IncidentListFilters {
    return {
        siteIds: [],
        cameraIds: [],
        severities: [],
        types: [],
        tags: [],
    };
}

const initialIncidentUIState: IncidentUIState = {
    filters: createDefaultFilters(),
    sort: [],
    pagination: {
        page: 1,
        pageSize: 25,
    },
    activeIncidentId: null,
    selectedIncidentIds: [],
    isDetailsPanelOpen: false,
};

type Listener = () => void;

let currentState: IncidentUIState = initialIncidentUIState;
const listeners = new Set<Listener>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

function setStateInternal(
    next: IncidentUIState,
): void {
    currentState = next;
    notify();
}

const incidentUIStore: IncidentUIStore = {
    getState(): IncidentUIState {
        return currentState;
    },

    setState(next: IncidentUIState): void {
        logger.info('incident ui store setState', {
            at: now(),
        });

        setStateInternal(next);
    },

    patchState(partial: Partial<IncidentUIState>): void {
        logger.debug('incident ui store patchState', {
            at: now(),
            keys: Object.keys(partial ?? {}),
        });

        setStateInternal({
            ...currentState,
            ...partial,
        });
    },

    clearSelection(): void {
        if (currentState.selectedIncidentIds.length === 0) {
            logger.debug('incident ui store clearSelection noop', {
                at: now(),
            });
            return;
        }

        logger.debug('incident ui store clearSelection', {
            at: now(),
            prevCount: currentState.selectedIncidentIds.length,
        });

        setStateInternal({
            ...currentState,
            selectedIncidentIds: [],
        });
    },

    toggleIncidentSelection(id: IncidentId): void {
        const exists = currentState.selectedIncidentIds.includes(id);

        const selectedIncidentIds = exists
            ? currentState.selectedIncidentIds.filter(
                (value) => value !== id,
            )
            : [...currentState.selectedIncidentIds, id];

        logger.debug('incident ui store toggleIncidentSelection', {
            at: now(),
            id: String(id),
            action: exists ? 'remove' : 'add',
            nextCount: selectedIncidentIds.length,
        });

        setStateInternal({
            ...currentState,
            selectedIncidentIds,
        });
    },

    setSelection(ids: IncidentId[]): void {
        logger.debug('incident ui store setSelection', {
            at: now(),
            nextCount: ids.length,
        });

        setStateInternal({
            ...currentState,
            selectedIncidentIds: [...ids],
        });
    },

    openIncidentDetails(id: IncidentId): void {
        logger.info('incident ui store openIncidentDetails', {
            at: now(),
            id: String(id),
        });

        setStateInternal({
            ...currentState,
            activeIncidentId: id,
            isDetailsPanelOpen: true,
        });
    },

    closeIncidentDetails(): void {
        logger.info('incident ui store closeIncidentDetails', {
            at: now(),
            prevActiveIncidentId: currentState.activeIncidentId
                ? String(currentState.activeIncidentId)
                : null,
        });

        setStateInternal({
            ...currentState,
            activeIncidentId: null,
            isDetailsPanelOpen: false,
        });
    },

    applyFilters(filters: IncidentListFilters): void {
        logger.info('incident ui store applyFilters', {
            at: now(),
            keys: Object.keys(filters ?? {}),
            resetPageTo: 1,
        });

        setStateInternal({
            ...currentState,
            filters,
            pagination: {
                ...currentState.pagination,
                page: 1,
            },
        });
    },

    reset(): void {
        logger.info('incident ui store reset', {
            at: now(),
        });

        setStateInternal(initialIncidentUIState);
    },
};

function subscribe(
    listener: Listener,
): () => void {
    listeners.add(listener);

    logger.debug('incident ui store subscribe', {
        at: now(),
        listenersCount: listeners.size,
    });

    return () => {
        listeners.delete(listener);

        logger.debug('incident ui store unsubscribe', {
            at: now(),
            listenersCount: listeners.size,
        });
    };
}

export function useIncidentUIStore(): {
    state: IncidentUIState;
    actions: IncidentUIStore;
} {
    const state = useSyncExternalStore(
        subscribe,
        incidentUIStore.getState,
        incidentUIStore.getState,
    );

    return {
        state,
        actions: incidentUIStore,
    };
}