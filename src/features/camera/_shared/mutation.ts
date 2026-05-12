// =====================
// src/features/camera/_shared/mutation.ts
// =====================

import type { UseMutationResult } from '@tanstack/react-query';

export function isMutationPending<
    TData = unknown,
    TError = unknown,
    TVariables = void,
    TContext = unknown,
>(
    mutation:
        | Pick<
        UseMutationResult<TData, TError, TVariables, TContext>,
        'status' | 'isPending'
    >
        | null
        | undefined,
): boolean {
    if (!mutation) {
        return false;
    }

    if (typeof mutation.isPending === 'boolean') {
        return mutation.isPending;
    }

    return mutation.status === 'pending';
}