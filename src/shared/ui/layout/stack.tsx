// =====================
// shared/ui/layout/stack.tsx
// =====================

import { JSX, ReactNode } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import type { AlignToken, JustifyToken } from '../types';
import { joinClassNames } from '../classNames';

export type StackDirection = 'row' | 'column';

export interface StackProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children?: ReactNode;
    className?: string;
    /**
     * Направление стека: по горизонтали или вертикали.
     * По умолчанию — 'column'.
     */
    direction?: StackDirection;
    /**
     * Зазор между элементами (px/rem и т.п.).
     * Число трактуется как px.
     */
    gap?: string | number;
    /**
     * Выравнивание по «поперечной» оси (align-items).
     */
    align?: AlignToken;
    /**
     * Выравнивание по основной оси (justify-content).
     */
    justify?: JustifyToken;
    /**
     * Разрешить перенос строк (для direction="row").
     */
    wrap?: boolean;
}

const normalizeSize = (value?: string | number): string | undefined => {
    if (value == null) return undefined;
    return typeof value === 'number' ? `${value}px` : value;
};

const mapAlignToAlignItems = (
    align?: AlignToken,
): CSSProperties['alignItems'] => {
    switch (align) {
        case 'start':
            return 'flex-start';
        case 'center':
            return 'center';
        case 'end':
            return 'flex-end';
        case 'stretch':
            return 'stretch';
        default:
            return undefined;
    }
};

const mapJustifyToJustifyContent = (
    justify?: JustifyToken,
): CSSProperties['justifyContent'] => {
    switch (justify) {
        case 'start':
            return 'flex-start';
        case 'center':
            return 'center';
        case 'end':
            return 'flex-end';
        case 'between':
            return 'space-between';
        default:
            return undefined;
    }
};

export function Stack({
                          children,
                          className,
                          direction = 'column',
                          gap,
                          align,
                          justify,
                          wrap,
                          style,
                          ...rest
                      }: StackProps): JSX.Element {
    const normalizedGap = normalizeSize(gap);

    const mergedStyle: CSSProperties = {
        display: 'flex',
        flexDirection: direction,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        gap: normalizedGap,
        alignItems: mapAlignToAlignItems(align),
        justifyContent: mapJustifyToJustifyContent(justify),
        ...style,
    };

    const mergedClassName = joinClassNames('ui-stack', className);

    return (
        <div className={mergedClassName} style={mergedStyle} {...rest}>
            {children}
        </div>
    );
}
