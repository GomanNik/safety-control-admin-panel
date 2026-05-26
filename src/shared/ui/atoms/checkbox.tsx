// =====================
// shared/ui/atoms/checkbox.tsx
// =====================

import { useId } from 'react';
import type {
    HTMLAttributes,
    InputHTMLAttributes,
    JSX,
    ReactNode,
} from 'react';
import { joinClassNames } from '../classNames';

const joinIds = (
    ...values: Array<string | undefined>
): string | undefined => {
    const normalized = values
        .map((value) => value?.trim())
        .filter(Boolean) as string[];

    if (normalized.length === 0) {
        return undefined;
    }

    return Array.from(new Set(normalized)).join(' ');
};

export interface CheckboxProps
    extends Omit<
        InputHTMLAttributes<HTMLInputElement>,
        'type' | 'className' | 'children'
    > {
    label?: ReactNode;
    description?: ReactNode;

    /**
     * className корневого <label>.
     */
    className?: string;

    /**
     * Явный className корневого <label>.
     * Предпочтительнее className для нового кода.
     */
    rootClassName?: string;

    /**
     * className нативного <input>.
     */
    inputClassName?: string;

    /**
     * Дополнительные props корневого <label>.
     */
    rootProps?: Omit<
        HTMLAttributes<HTMLLabelElement>,
        'children' | 'className'
    >;

    /**
     * Дополнительные props нативного <input>.
     */
    inputProps?: Omit<
        InputHTMLAttributes<HTMLInputElement>,
        'type' | 'className' | 'children'
    >;
}

export function Checkbox({
                             label,
                             description,
                             className,
                             rootClassName,
                             inputClassName,
                             rootProps,
                             inputProps,
                             id: idProp,
                             'aria-describedby': ariaDescribedBy,
                             disabled,
                             ...restInputProps
                         }: CheckboxProps): JSX.Element {
    const generatedId = useId();
    const inputId =
        inputProps?.id ?? idProp ?? generatedId;

    const descriptionId = description
        ? `${inputId}-description`
        : undefined;

    const combinedRootClassName = joinClassNames(
        'ui-checkbox',
        Boolean(description)
            ? 'ui-checkbox--with-description'
            : undefined,
        className,
        rootClassName,
    );

    const combinedInputClassName = joinClassNames(
        'ui-checkbox__input',
        inputClassName,
    );

    const mergedAriaDescribedBy = joinIds(
        typeof ariaDescribedBy === 'string'
            ? ariaDescribedBy
            : undefined,
        typeof inputProps?.['aria-describedby'] ===
        'string'
            ? inputProps['aria-describedby']
            : undefined,
        descriptionId,
    );

    return (
        <label
            {...rootProps}
            className={combinedRootClassName}
        >
            <span className="ui-checkbox__control">
                <input
                    {...restInputProps}
                    {...inputProps}
                    id={inputId}
                    type="checkbox"
                    className={combinedInputClassName}
                    disabled={
                        disabled ?? inputProps?.disabled
                    }
                    aria-describedby={
                        mergedAriaDescribedBy
                    }
                />
                <span
                    className="ui-checkbox__box"
                    aria-hidden="true"
                />
            </span>

            {(label || description) && (
                <span className="ui-checkbox__content">
                    {label ? (
                        <span className="ui-checkbox__label">
                            {label}
                        </span>
                    ) : null}

                    {description ? (
                        <span
                            id={descriptionId}
                            className="ui-checkbox__description"
                        >
                            {description}
                        </span>
                    ) : null}
                </span>
            )}
        </label>
    );
}