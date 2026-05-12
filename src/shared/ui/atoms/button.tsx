// =====================
// shared/ui/atoms/button.tsx
// =====================

import type {
    ButtonHTMLAttributes,
    JSX,
    ReactNode,
} from 'react';
import { joinClassNames } from '../classNames';

export type ButtonVariant =
    | 'primary'
    | 'secondary'
    | 'ghost'
    | 'outline'
    | 'danger';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    isLoading?: boolean;
}

export function Button({
                           variant = 'primary',
                           size = 'md',
                           leftIcon,
                           rightIcon,
                           isLoading = false,
                           className,
                           children,
                           type,
                           disabled,
                           ...rest
                       }: ButtonProps): JSX.Element {
    const baseClassName = 'ui-button';
    const effectiveDisabled =
        Boolean(disabled) || isLoading;

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--variant-${variant}`,
        `${baseClassName}--size-${size}`,
        isLoading && `${baseClassName}--loading`,
        className,
    );

    return (
        <button
            {...rest}
            type={type ?? 'button'}
            className={combinedClassName}
            data-variant={variant}
            data-size={size}
            disabled={effectiveDisabled}
            aria-busy={isLoading || undefined}
        >
            {leftIcon ? (
                <span
                    className={joinClassNames(
                        `${baseClassName}__icon`,
                        `${baseClassName}__icon--left`,
                    )}
                    aria-hidden="true"
                >
                    {leftIcon}
                </span>
            ) : null}

            {children != null ? (
                <span className={`${baseClassName}__label`}>
                    {children}
                </span>
            ) : null}

            {rightIcon ? (
                <span
                    className={joinClassNames(
                        `${baseClassName}__icon`,
                        `${baseClassName}__icon--right`,
                    )}
                    aria-hidden="true"
                >
                    {rightIcon}
                </span>
            ) : null}
        </button>
    );
}