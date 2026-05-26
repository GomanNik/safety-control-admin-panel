// =====================
// File: src/shared/ui/atoms/skeleton.tsx
// Purpose:
// - Skeleton placeholder atom
// - Support text / rect / circle variants
// - Keep public API stable
// =====================

import type {
    CSSProperties,
    HTMLAttributes,
    JSX,
} from 'react';

import { joinClassNames } from '../classNames';

export type SkeletonVariant =
    | 'text'
    | 'rect'
    | 'circle';

export interface SkeletonProps
    extends HTMLAttributes<HTMLDivElement> {
    variant?: SkeletonVariant;
    width?: number | string;
    height?: number | string;
    radius?: number | string;
}

const normalizeSize = (
    value?: number | string,
): string | undefined => {
    if (value == null) {
        return undefined;
    }

    return typeof value === 'number'
        ? `${value}px`
        : value;
};

export function Skeleton({
                             variant = 'text',
                             width,
                             height,
                             radius,
                             className,
                             style,
                             ...rest
                         }: SkeletonProps): JSX.Element {
    const baseClassName = 'ui-skeleton';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--variant-${variant}`,
        className,
    );

    const mergedStyle: CSSProperties = {
        width: normalizeSize(width),
        height: normalizeSize(height),
        borderRadius:
            variant === 'circle'
                ? '9999px'
                : normalizeSize(radius),
        ...style,
    };

    return (
        <div
            {...rest}
            className={combinedClassName}
            style={mergedStyle}
            aria-hidden="true"
        />
    );
}