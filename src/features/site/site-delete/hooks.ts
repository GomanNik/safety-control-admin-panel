// =====================
// File: src/features/site/site-delete/hooks.ts
// Purpose:
// - Feature hook for site delete flow
// - Frontend does not block delete by linked cameras
// - Backend is expected to cascade delete related entities
// =====================

import {
    useCallback,
    useMemo,
    useState,
} from 'react';

import type { SiteId } from '../../../shared/api';

import {
    createHttpError,
    HttpErrorCode,
} from '../../../shared/api';

import type { SiteApiError } from '../../../entities/site';
import { useSiteDeleteMutation } from '../../../entities/site';

import { isMutationPending } from '../_shared/mutation';

import type {
    SiteDeleteRequest,
    SiteDeleteResult,
    UseSiteDeleteFeatureResult,
} from './types';

const ensureSiteId = (
    request: SiteDeleteRequest,
): SiteId => {
    const normalizedSiteId = String(request.siteId ?? '').trim();

    if (!normalizedSiteId) {
        throw createHttpError({
            code: HttpErrorCode.ValidationError,
            message: 'Site id is required for deletion',
        }) as SiteApiError;
    }

    return normalizedSiteId as SiteId;
};

const toSiteDeleteError = (
    error: unknown,
    fallbackMessage: string,
): SiteApiError => {
    if (error && typeof error === 'object') {
        const candidate = error as Partial<SiteApiError>;

        if (
            typeof candidate.code === 'string' &&
            typeof candidate.message === 'string'
        ) {
            return candidate as SiteApiError;
        }
    }

    return createHttpError({
        code: HttpErrorCode.Unknown,
        message: fallbackMessage,
        details: error,
    }) as SiteApiError;
};

export const useSiteDelete = (): UseSiteDeleteFeatureResult => {
    const mutation = useSiteDeleteMutation();
    const [localError, setLocalError] = useState<SiteApiError | null>(null);

    const remove = useCallback(
        async (request: SiteDeleteRequest): Promise<SiteDeleteResult> => {
            setLocalError(null);

            let siteId: SiteId;

            try {
                siteId = ensureSiteId(request);
            } catch (error) {
                const normalizedError = toSiteDeleteError(
                    error,
                    'Site delete failed',
                );

                setLocalError(normalizedError);
                throw normalizedError;
            }

            try {
                await mutation.mutateAsync({ siteId });

                return {
                    siteId,
                };
            } catch (error) {
                const normalizedError = toSiteDeleteError(
                    error,
                    'Site delete failed',
                );

                setLocalError(normalizedError);
                throw normalizedError;
            }
        },
        [mutation],
    );

    const reset = useCallback((): void => {
        setLocalError(null);
        mutation.reset();
    }, [mutation]);

    return useMemo<UseSiteDeleteFeatureResult>(
        () => ({
            isDeleting: isMutationPending(mutation),
            error: localError ?? mutation.error ?? null,
            remove,
            reset,
        }),
        [localError, mutation, remove, reset],
    );
};