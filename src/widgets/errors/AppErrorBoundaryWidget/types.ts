// =====================
// src/widgets/errors/AppErrorBoundaryWidget/types.ts
// =====================

/**
 * AppErrorBoundaryWidget types.
 */

import type { ReactNode } from 'react';

export type AppErrorBoundaryFallbackRender = (args: {
    error: Error;
    reset: () => void;
}) => ReactNode;

export interface AppErrorBoundaryWidgetProps {
    children: ReactNode;

    /**
     * Optional custom fallback renderer.
     * If not provided, default fallback UI will be used.
     */
    fallback?: AppErrorBoundaryFallbackRender;

    /**
     * Called when user clicks "Reset".
     * Used to reset outer subtree / route / screen state.
     */
    onReset?: () => void;

    /**
     * Changing this key clears captured boundary error state.
     * Useful when outer page wants to remount or reset subtree.
     */
    resetKey?: string | number;

    /**
     * Show technical details in default fallback.
     * By default enabled only in DEV.
     */
    showTechnicalDetails?: boolean;
}