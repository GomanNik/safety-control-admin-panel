// =====================
// File: src/shared/ui/atoms/badge.tsx
// Purpose:
// - Badge atom
// - Simple semantic/outline/default variants
// - Keep public API stable
// =====================

import type {
    HTMLAttributes,
    JSX,
    ReactNode,
} from 'react';

import type { SemanticColorKey } from '../../theme';
import { joinClassNames } from '../classNames';

export type BadgeVariant =
    | 'default'
    | 'outline'
    | SemanticColorKey;

export interface BadgeProps
    extends HTMLAttributes<HTMLSpanElement> {
    children?: ReactNode;
    variant?: BadgeVariant;
}

export function Badge({
                          children,
                          className,
                          variant = 'default',
                          ...rest
                      }: BadgeProps): JSX.Element {
    const baseClassName = 'ui-badge';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--variant-${variant}`,
        className,
    );

    return (
        <span
            {...rest}
            className={combinedClassName}
            data-variant={variant}
        >
            {children}
        </span>
    );
}