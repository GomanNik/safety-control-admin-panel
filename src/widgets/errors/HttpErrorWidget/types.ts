// =====================
// src/widgets/errors/HttpErrorWidget/types.ts
// =====================

/**
 * HttpErrorWidget types.
 */

export interface HttpErrorWidgetProps {
    error: unknown;

    /**
     * Optional retry callback (e.g. refetch from react-query).
     */
    onRetry?: () => void;

    /**
     * Optional reset callback (e.g. navigate to safe route).
     */
    onReset?: () => void;

    /**
     * Show technical details by default.
     */
    defaultShowDetails?: boolean;
}