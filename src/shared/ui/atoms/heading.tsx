// =====================
// shared/ui/atoms/heading.tsx
// =====================

import { createElement } from 'react';
import type {
    HTMLAttributes,
    JSX,
    ReactNode,
} from 'react';
import { joinClassNames } from '../classNames';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingAlign = 'left' | 'center' | 'right';
export type HeadingSize = 'sm' | 'md' | 'lg';
export type HeadingTag =
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6';

export interface HeadingProps
    extends Omit<HTMLAttributes<HTMLHeadingElement>, 'children'> {
    children?: ReactNode;

    /**
     * Семантический уровень заголовка.
     * Определяет реальный HTML-тег: h1..h6.
     */
    level?: HeadingLevel;

    /**
     * Визуальный уровень.
     * Если не передан, используется semantic level.
     */
    visualLevel?: HeadingLevel;

    align?: HeadingAlign;
    size?: HeadingSize;
}

const resolveHeadingTag = (
    level: HeadingLevel,
): HeadingTag => {
    switch (level) {
        case 1:
            return 'h1';
        case 2:
            return 'h2';
        case 3:
            return 'h3';
        case 4:
            return 'h4';
        case 5:
            return 'h5';
        case 6:
        default:
            return 'h6';
    }
};

export function Heading({
                            level = 2,
                            visualLevel,
                            children,
                            className,
                            align,
                            size,
                            ...rest
                        }: HeadingProps): JSX.Element {
    const semanticTag = resolveHeadingTag(level);
    const resolvedVisualLevel =
        visualLevel ?? level;

    const baseClassName = 'ui-heading';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--level-${resolvedVisualLevel}`,
        size
            ? `${baseClassName}--size-${size}`
            : undefined,
        align
            ? `${baseClassName}--align-${align}`
            : undefined,
        className,
    );

    return createElement(
        semanticTag,
        {
            ...rest,
            className: combinedClassName,
        },
        children,
    );
}