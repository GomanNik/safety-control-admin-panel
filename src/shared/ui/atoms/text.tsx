// =====================
// shared/ui/atoms/text.tsx
// =====================

import { createElement } from 'react';
import type {
    HTMLAttributes,
    JSX,
    ReactNode,
} from 'react';
import { joinClassNames } from '../classNames';

export type TextVariant =
    | 'body'
    | 'muted'
    | 'danger'
    | 'success'
    | 'caption';

export type TextAlign = 'left' | 'center' | 'right';

export type TextElement =
    | 'p'
    | 'span'
    | 'div'
    | 'small'
    | 'strong';

export interface TextProps
    extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    children?: ReactNode;

    /**
     * Ограниченный набор текстовых тегов.
     * Намеренно без heading-тегов, чтобы не дублировать Heading.
     */
    as?: TextElement;

    variant?: TextVariant;
    align?: TextAlign;
    truncate?: boolean;
}

export function Text({
                         as = 'p',
                         children,
                         className,
                         variant = 'body',
                         align,
                         truncate,
                         ...rest
                     }: TextProps): JSX.Element {
    const baseClassName = 'ui-text';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--variant-${variant}`,
        align
            ? `${baseClassName}--align-${align}`
            : undefined,
        truncate
            ? `${baseClassName}--truncate`
            : undefined,
        className,
    );

    return createElement(
        as,
        {
            ...rest,
            className: combinedClassName,
        },
        children,
    );
}