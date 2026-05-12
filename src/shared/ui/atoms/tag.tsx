// =====================
// File: src/shared/ui/atoms/tag.tsx
// Purpose:
// - Tag atom
// - Close button label now resolves through i18n fallback
// =====================

import type {
    HTMLAttributes,
    JSX,
    MouseEvent as ReactMouseEvent,
    ReactNode,
} from 'react';
import { t } from '../../i18n';
import { joinClassNames } from '../classNames';

export type TagVariant =
    | 'default'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'unknown'
    | 'outline';

export interface TagProps
    extends Omit<HTMLAttributes<HTMLSpanElement>, 'onClose'> {
    children?: ReactNode;
    variant?: TagVariant;

    /**
     * Колбэк закрытия тега.
     * Если задан, рендерится кнопка закрытия.
     */
    onClose?: (
        event: ReactMouseEvent<HTMLButtonElement>,
    ) => void;

    /**
     * Текст для aria-label кнопки закрытия.
     */
    closeButtonLabel?: string;
}

export function Tag({
    children,
    className,
    variant = 'default',
    onClose,
    closeButtonLabel,
    ...rest
}: TagProps): JSX.Element {
    const baseClassName = 'ui-tag';

    const combinedClassName = joinClassNames(
        baseClassName,
        `${baseClassName}--variant-${variant}`,
        onClose && `${baseClassName}--closable`,
        className,
    );

    const resolvedCloseButtonLabel =
        closeButtonLabel ??
        t('common.close', {
            defaultValue: 'Close tag',
        });

    const handleCloseClick = (
        event: ReactMouseEvent<HTMLButtonElement>,
    ): void => {
        event.stopPropagation();
        onClose?.(event);
    };

    return (
        <span
            {...rest}
            className={combinedClassName}
            data-variant={variant}
        >
            <span className={`${baseClassName}__label`}>
                {children}
            </span>

            {onClose ? (
                <button
                    type="button"
                    className={`${baseClassName}__close`}
                    onClick={handleCloseClick}
                    aria-label={resolvedCloseButtonLabel}
                    title={resolvedCloseButtonLabel}
                >
                    ×
                </button>
            ) : null}
        </span>
    );
}