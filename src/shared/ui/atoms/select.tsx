// =====================
// File: src/shared/ui/atoms/select.tsx
// Purpose:
// - Native select atom
// - Tightened option label contract for native <option>
// =====================

import type {
    JSX,
    ReactNode,
    SelectHTMLAttributes,
} from 'react';
import { joinClassNames } from '../classNames';

export interface SelectOption {
    value: string | number;
    /**
     * Для native <option> поддерживаем только текст/число.
     */
    label: string | number;
    disabled?: boolean;
}

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectProps
    extends Omit<
        SelectHTMLAttributes<HTMLSelectElement>,
        'size'
    > {
    options?: ReadonlyArray<SelectOption>;

    /**
     * Унифицированный размер контрола.
     */
    size?: SelectSize;

    /**
     * @deprecated Используй size.
     */
    selectSize?: SelectSize;

    /**
     * Явные option/optgroup-узлы.
     */
    children?: ReactNode;
}

type SelectInternalProps = Omit<
    SelectProps,
    'selectSize'
> & {
    selectSize?: SelectSize;
};

export function Select(props: SelectProps): JSX.Element;
export function Select({
    options,
    size,
    selectSize,
    className,
    children,
    ...rest
}: SelectInternalProps): JSX.Element {
    const resolvedSize = size ?? selectSize ?? 'md';

    const baseClassName = 'ui-select';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--size-${resolvedSize}`,
        className,
    );

    return (
        <select
            {...rest}
            className={combinedClassName}
            data-size={resolvedSize}
        >
            {options?.map((option) => (
                <option
                    key={String(option.value)}
                    value={option.value}
                    disabled={option.disabled}
                >
                    {option.label}
                </option>
            ))}

            {children}
        </select>
    );
}