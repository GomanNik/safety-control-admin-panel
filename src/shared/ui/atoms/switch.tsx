// =====================
// File: src/shared/ui/atoms/switch.tsx
// Purpose:
// - Switch atom
// - Controlled checked state + optional label/description
// - Keep public API stable
// =====================

import { useId } from 'react';
import type {
    ButtonHTMLAttributes,
    JSX,
    MouseEvent as ReactMouseEvent,
    ReactNode,
} from 'react';

import { joinClassNames } from '../classNames';

export interface SwitchProps
    extends Omit<
        ButtonHTMLAttributes<HTMLButtonElement>,
        'type' | 'children'
    > {
    checked: boolean;
    onCheckedChange?(checked: boolean): void;
    label?: ReactNode;
    description?: ReactNode;
}

export function Switch({
                           checked,
                           onCheckedChange,
                           label,
                           description,
                           className,
                           disabled,
                           id,
                           onClick,
                           ...rest
                       }: SwitchProps): JSX.Element {
    const generatedId = useId();
    const resolvedId = id ?? generatedId;

    const descriptionId = description
        ? `${resolvedId}-description`
        : undefined;

    const baseClassName = 'ui-switch';

    const rootClassName = joinClassNames(
        baseClassName,
        checked && `${baseClassName}--checked`,
        disabled && `${baseClassName}--disabled`,
        className,
    );

    const handleClick = (
        event: ReactMouseEvent<HTMLButtonElement>,
    ): void => {
        onClick?.(event);

        if (event.defaultPrevented || disabled) {
            return;
        }

        onCheckedChange?.(!checked);
    };

    return (
        <button
            {...rest}
            id={resolvedId}
            type="button"
            className={rootClassName}
            role="switch"
            aria-checked={checked}
            aria-describedby={descriptionId}
            disabled={disabled}
            onClick={handleClick}
        >
            <span
                className={`${baseClassName}__track`}
                aria-hidden="true"
            >
                <span
                    className={`${baseClassName}__thumb`}
                />
            </span>

            {(label || description) && (
                <span
                    className={`${baseClassName}__content`}
                >
                    {label ? (
                        <span
                            className={`${baseClassName}__label`}
                        >
                            {label}
                        </span>
                    ) : null}

                    {description ? (
                        <span
                            id={descriptionId}
                            className={`${baseClassName}__description`}
                        >
                            {description}
                        </span>
                    ) : null}
                </span>
            )}
        </button>
    );
}