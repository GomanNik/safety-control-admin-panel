// =====================
// File: src/shared/ui/atoms/radio.tsx
// Purpose:
// - Radio atom
// - Preserve backward-compatible public props
// - Keep accessibility wiring explicit
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

export interface RadioProps
    extends Omit<
        InputHTMLAttributes<HTMLInputElement>,
        'type' | 'className' | 'children'
    > {
    label?: ReactNode;
    description?: ReactNode;

    /**
     * className корневого <label>.
     * Сохранён для совместимости.
     */
    className?: string;

    /**
     * Явный className корневого <label>.
     * Предпочтительнее для нового кода.
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

export function Radio({
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
                      }: RadioProps): JSX.Element {
    const generatedId = useId();

    const inputId =
        inputProps?.id ?? idProp ?? generatedId;

    const descriptionId = description
        ? `${inputId}-description`
        : undefined;

    const resolvedDisabled =
        disabled ?? inputProps?.disabled;

    const mergedRootClassName = joinClassNames(
        'ui-radio',
        description
            ? 'ui-radio--with-description'
            : undefined,
        className,
        rootClassName,
    );

    const mergedInputClassName = joinClassNames(
        'ui-radio__input',
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
            className={mergedRootClassName}
        >
            <span className="ui-radio__control">
                <input
                    {...restInputProps}
                    {...inputProps}
                    id={inputId}
                    type="radio"
                    className={mergedInputClassName}
                    disabled={resolvedDisabled}
                    aria-describedby={
                        mergedAriaDescribedBy
                    }
                />
                <span
                    className="ui-radio__circle"
                    aria-hidden="true"
                />
            </span>

            {(label || description) && (
                <span className="ui-radio__content">
                    {label ? (
                        <span className="ui-radio__label">
                            {label}
                        </span>
                    ) : null}

                    {description ? (
                        <span
                            id={descriptionId}
                            className="ui-radio__description"
                        >
                            {description}
                        </span>
                    ) : null}
                </span>
            )}
        </label>
    );
}