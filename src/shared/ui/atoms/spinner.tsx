// =====================
// File: src/shared/ui/atoms/spinner.tsx
// Purpose:
// - Spinner atom
// - Accessible loading label support
// - Keep public API stable
// =====================

import type {
    HTMLAttributes,
    JSX,
} from 'react';

import { t } from '../../i18n';
import { joinClassNames } from '../classNames';

export type SpinnerSize =
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg';

export interface SpinnerProps
    extends HTMLAttributes<HTMLSpanElement> {
    size?: SpinnerSize;

    /**
     * Скрыть спиннер от скринридера.
     * По умолчанию false.
     */
    visuallyHidden?: boolean;

    /**
     * A11y-подпись для скринридера.
     */
    label?: string;
}

export function Spinner({
                            size = 'md',
                            className,
                            visuallyHidden = false,
                            label,
                            ...rest
                        }: SpinnerProps): JSX.Element {
    const baseClassName = 'ui-spinner';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--size-${size}`,
        className,
    );

    const resolvedLabel =
        label ??
        t('common.pleaseWait', {
            defaultValue: 'Loading',
        });

    const ariaProps: HTMLAttributes<HTMLSpanElement> =
        visuallyHidden
            ? {
                'aria-hidden': true,
            }
            : {
                role: 'status',
                'aria-live': 'polite',
                'aria-label': resolvedLabel,
            };

    return (
        <span
            {...rest}
            {...ariaProps}
            className={combinedClassName}
        >
            <span className={`${baseClassName}__circle`} />
        </span>
    );
}