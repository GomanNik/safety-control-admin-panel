// =====================
// shared/ui/atoms/input.tsx
// =====================

import type {
    InputHTMLAttributes,
    JSX,
} from 'react';
import { joinClassNames } from '../classNames';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps
    extends Omit<
        InputHTMLAttributes<HTMLInputElement>,
        'size'
    > {
    /**
     * Унифицированный размер контрола.
     */
    size?: InputSize;

    /**
     * @deprecated Используй size.
     */
    inputSize?: InputSize;
}

type InputInternalProps = Omit<
    InputProps,
    'inputSize'
> & {
    inputSize?: InputSize;
};

export function Input(props: InputProps): JSX.Element;
export function Input({
                          size,
                          inputSize,
                          className,
                          ...rest
                      }: InputInternalProps): JSX.Element {
    const resolvedSize =
        size ?? inputSize ?? 'md';

    const baseClassName = 'ui-input';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--size-${resolvedSize}`,
        className,
    );

    return (
        <input
            {...rest}
            className={combinedClassName}
            data-size={resolvedSize}
        />
    );
}