// =====================
// File: src/features/site/_shared/mutation.ts
// Purpose:
// - Shared mutation helpers for site features
// - Keeps mutation pending-state compatibility in one place
// =====================

import type { UseMutationResult } from '@tanstack/react-query';

export type MutationPendingLike<
    TData = unknown,
    TError = unknown,
    TVariables = void,
    TContext = unknown,
> =
    | Pick<
    UseMutationResult<TData, TError, TVariables, TContext>,
    'status' | 'isPending'
>
    | {
    status?: string;
    isPending?: boolean;
}
    | null
    | undefined;

/**
 * Safe helper for detecting pending mutation state across
 * different tanstack/react-query versions.
 */
export function isMutationPending<
    TData = unknown,
    TError = unknown,
    TVariables = void,
    TContext = unknown,
>(
    mutation: MutationPendingLike<TData, TError, TVariables, TContext>,
): boolean {
    if (!mutation) {
        return false;
    }

    if (typeof mutation.isPending === 'boolean') {
        return mutation.isPending;
    }

    return mutation.status === 'pending';
}