// =====================
// shared/ui/atoms/textarea.tsx
// =====================

import type {
    JSX,
    TextareaHTMLAttributes,
} from 'react';
import { joinClassNames } from '../classNames';

export type TextareaSize = 'sm' | 'md' | 'lg';

export interface TextareaProps
    extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    /**
     * Унифицированный размер контрола.
     */
    size?: TextareaSize;

    /**
     * @deprecated Используй size.
     */
    textareaSize?: TextareaSize;
}

type TextareaInternalProps = Omit<
    TextareaProps,
    'textareaSize'
> & {
    textareaSize?: TextareaSize;
};

export function Textarea(
    props: TextareaProps,
): JSX.Element;
export function Textarea({
                             size,
                             textareaSize,
                             className,
                             ...rest
                         }: TextareaInternalProps): JSX.Element {
    const resolvedSize =
        size ?? textareaSize ?? 'md';

    const baseClassName = 'ui-textarea';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--size-${resolvedSize}`,
        className,
    );

    return (
        <textarea
            {...rest}
            className={combinedClassName}
            data-size={resolvedSize}
        />
    );
}