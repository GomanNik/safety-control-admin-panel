// =====================
// shared/ui/layout/grid.tsx
// =====================

import { JSX, ReactNode } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import type { AlignToken, JustifyToken } from '../types';
import { joinClassNames } from '../classNames';

export interface GridProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children?: ReactNode;
    className?: string;

    /**
     * Явное управление grid-template-columns (например: "minmax(0, 2fr) minmax(0, 1fr)").
     * Имеет приоритет над columns/minColumnWidth.
     */
    templateColumns?: CSSProperties['gridTemplateColumns'];

    /**
     * Кол-во колонок.
     *  - число → repeat(n, minmax(0, 1fr))
     *  - 'auto-fit' / 'auto-fill' → repeat(auto-*, minmax(minColumnWidth, 1fr))
     */
    columns?: number | 'auto-fit' | 'auto-fill';

    /**
     * Минимальная ширина колонки (используется вместе с auto-fit/auto-fill).
     * Можно передать число (px) или строку (например '240px', '16rem').
     */
    minColumnWidth?: number | string;

    /**
     * Зазор между элементами (px/rem и т.п.).
     * Число трактуется как px.
     */
    gap?: string | number;

    /**
     * Выравнивание элементов по вертикали.
     */
    align?: AlignToken;

    /**
     * Выравнивание элементов по горизонтали.
     */
    justify?: JustifyToken;
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
            return 'start';
        case 'center':
            return 'center';
        case 'end':
            return 'end';
        case 'stretch':
            return 'stretch';
        default:
            return undefined;
    }
};

const mapJustifyToJustifyItems = (
    justify?: JustifyToken,
): CSSProperties['justifyItems'] => {
    switch (justify) {
        case 'start':
            return 'start';
        case 'center':
            return 'center';
        case 'end':
            return 'end';
        case 'between':
            return undefined; // between — это не justifyItems
        default:
            return undefined;
    }
};

const mapJustifyToJustifyContent = (
    justify?: JustifyToken,
): CSSProperties['justifyContent'] => {
    switch (justify) {
        case 'between':
            return 'space-between';
        case 'start':
            return 'start';
        case 'center':
            return 'center';
        case 'end':
            return 'end';
        default:
            return undefined;
    }
};

export function Grid({
                         children,
                         className,
                         templateColumns,
                         columns,
                         minColumnWidth,
                         gap,
                         align,
                         justify,
                         style,
                         ...rest
                     }: GridProps): JSX.Element {
    const normalizedGap = normalizeSize(gap);

    let gridTemplateColumns: CSSProperties['gridTemplateColumns'] | undefined =
        templateColumns;

    if (!gridTemplateColumns) {
        if (typeof columns === 'number' && columns > 0) {
            gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
        } else if (
            (columns === 'auto-fit' || columns === 'auto-fill') &&
            minColumnWidth
        ) {
            const minWidth = normalizeSize(minColumnWidth) ?? '200px';
            gridTemplateColumns = `repeat(${columns}, minmax(${minWidth}, 1fr))`;
        }
    }

    const mergedStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns,
        gap: normalizedGap,
        alignItems: mapAlignToAlignItems(align),

        justifyItems: mapJustifyToJustifyItems(justify),
        justifyContent: mapJustifyToJustifyContent(justify),

        ...style,
    };

    const mergedClassName = joinClassNames('ui-grid', className);

    return (
        <div className={mergedClassName} style={mergedStyle} {...rest}>
            {children}
        </div>
    );
}
