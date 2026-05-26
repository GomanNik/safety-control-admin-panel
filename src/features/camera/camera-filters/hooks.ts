// =====================
// File: src/features/camera/camera-filters/hooks.ts
// Purpose:
//   Filter use-case for cameras over CameraUIStore:
//   - apply
//   - reset
//   - restore
//   - clearPersisted
//   Aligned with simplified camera UI store.
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    useCameraUIStore,
    type CameraListFilters,
} from '../../../entities/camera';

import type {
    CameraFiltersStorageDriver,
    CameraFiltersUseCase,
} from './types';
import { createCameraFiltersStorageDriver } from './storage';

export interface UseCameraFiltersOptions {
    storage?: CameraFiltersStorageDriver | false;
    restoreOnMount?: boolean;
    restorePolicy?: 'ifEmpty' | 'always';
    persistOnChange?: boolean;
}

const isMeaningful = (
    value: unknown,
): boolean => {
    if (value == null) {
        return false;
    }

    if (Array.isArray(value)) {
        return value.length > 0;
    }

    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    return true;
};

const isEmptyFilters = (
    filters: CameraListFilters,
): boolean => {
    for (const value of Object.values(filters as Record<string, unknown>)) {
        if (isMeaningful(value)) {
            return false;
        }
    }

    return true;
};

const stableStringify = (
    value: unknown,
): string => {
    const seen = new WeakSet<object>();

    const walk = (current: unknown): unknown => {
        if (current == null || typeof current !== 'object') {
            return current;
        }

        if (seen.has(current as object)) {
            return '[Circular]';
        }

        seen.add(current as object);

        if (Array.isArray(current)) {
            return current.map(walk);
        }

        const input = current as Record<string, unknown>;
        const output: Record<string, unknown> = {};

        for (const key of Object.keys(input).sort()) {
            output[key] = walk(input[key]);
        }

        return output;
    };

    try {
        return JSON.stringify(walk(value));
    } catch {
        return '';
    }
};

export const useCameraFilters = (
    options?: UseCameraFiltersOptions,
): CameraFiltersUseCase => {
    const { state, actions } = useCameraUIStore();
    const [lastAppliedAt, setLastAppliedAt] = useState<Date | undefined>(
        undefined,
    );

    const currentFilters = state.filters;

    const storage = useMemo<CameraFiltersStorageDriver | null>(() => {
        if (options?.storage === false) {
            return null;
        }

        if (options?.storage) {
            return options.storage;
        }

        return createCameraFiltersStorageDriver();
    }, [options?.storage]);

    const persistOnChange = options?.persistOnChange ?? Boolean(storage);

    const persistFilters = useCallback(
        (filters: CameraListFilters): void => {
            if (!storage || !persistOnChange) {
                return;
            }

            try {
                storage.save(filters);
            } catch {
                // noop
            }
        },
        [storage, persistOnChange],
    );

    const apply = useCallback(
        (next: CameraListFilters): void => {
            actions.resetFilters();

            if (!isEmptyFilters(next)) {
                actions.setFilters(next);
            }

            persistFilters(next);
            setLastAppliedAt(new Date());
        },
        [actions, persistFilters],
    );

    const reset = useCallback((): void => {
        actions.resetFilters();
        persistFilters({});
        setLastAppliedAt(new Date());
    }, [actions, persistFilters]);

    const restore = useCallback((): void => {
        if (!storage) {
            return;
        }

        try {
            const loaded = storage.load();

            if (!loaded) {
                return;
            }

            const restorePolicy = options?.restorePolicy ?? 'ifEmpty';

            if (restorePolicy === 'ifEmpty' && !isEmptyFilters(currentFilters)) {
                return;
            }

            if (
                stableStringify(currentFilters) ===
                stableStringify(loaded)
            ) {
                return;
            }

            actions.resetFilters();

            if (!isEmptyFilters(loaded)) {
                actions.setFilters(loaded);
            }

            setLastAppliedAt(new Date());
        } catch {
            // noop
        }
    }, [actions, currentFilters, options?.restorePolicy, storage]);

    const clearPersisted = useCallback((): void => {
        if (!storage) {
            return;
        }

        try {
            storage.clear();
        } catch {
            // noop
        }
    }, [storage]);

    const restoreOnMount = options?.restoreOnMount ?? Boolean(storage);
    const didRestoreRef = useRef(false);

    useEffect(() => {
        if (!restoreOnMount || !storage || didRestoreRef.current) {
            return;
        }

        didRestoreRef.current = true;
        restore();
    }, [restore, restoreOnMount, storage]);

    const useCaseState = useMemo(
        () => ({
            value: currentFilters,
            lastAppliedAt,
        }),
        [currentFilters, lastAppliedAt],
    );

    const useCaseActions = useMemo(
        () => ({
            apply,
            reset,
            restore,
            clearPersisted,
        }),
        [apply, reset, restore, clearPersisted],
    );

    return useMemo(
        () => ({
            state: useCaseState,
            actions: useCaseActions,
        }),
        [useCaseActions, useCaseState],
    );
};