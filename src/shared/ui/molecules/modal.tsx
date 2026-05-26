// =====================
// File: src/shared/ui/molecules/modal.tsx
// Purpose:
// - Modal molecule
// - Added portal rendering
// - Added localized close button label
// =====================

import {
    useEffect,
    useId,
    useRef,
} from 'react';
import { createPortal } from 'react-dom';
import type {
    HTMLAttributes,
    JSX,
    KeyboardEvent as ReactKeyboardEvent,
    MouseEvent as ReactMouseEvent,
    ReactNode,
    ReactPortal,
    RefObject,
} from 'react';
import { t } from '../../i18n';
import { joinClassNames } from '../classNames';

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

export interface ModalProps {
    open: boolean;
    onClose?: () => void;
    title?: ReactNode;
    footer?: ReactNode;
    children?: ReactNode;

    /**
     * Размер внутреннего диалога.
     */
    size?: ModalSize;

    /**
     * Закрывать ли по клику на backdrop.
     */
    closeOnBackdropClick?: boolean;

    /**
     * Закрывать ли по Escape.
     */
    closeOnEsc?: boolean;

    /**
     * Показать стандартную кнопку закрытия.
     */
    showCloseButton?: boolean;

    /**
     * aria-label для диалога, если нет title.
     */
    ariaLabel?: string;

    /**
     * Лок управления фокусом внутри диалога.
     */
    trapFocus?: boolean;

    /**
     * Блокировка прокрутки body на время открытия.
     */
    lockScroll?: boolean;

    /**
     * Восстановление фокуса после закрытия.
     */
    restoreFocus?: boolean;

    /**
     * Куда поставить фокус при открытии.
     */
    initialFocusRef?: RefObject<HTMLElement | null>;

    /**
     * Куда вернуть фокус при закрытии.
     */
    finalFocusRef?: RefObject<HTMLElement | null>;

    /**
     * Текст aria-label для кнопки закрытия.
     */
    closeButtonLabel?: string;

    /**
     * Классы и html-атрибуты overlay.
     */
    overlayProps?: Omit<
        HTMLAttributes<HTMLDivElement>,
        'children'
    >;

    /**
     * Классы и html-атрибуты внутреннего диалога.
     */
    contentProps?: Omit<
        HTMLAttributes<HTMLDivElement>,
        'children' | 'title'
    >;
}

const getFocusableElements = (
    container: HTMLElement,
): HTMLElement[] => {
    const selector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
    ].join(',');

    return Array.from(
        container.querySelectorAll<HTMLElement>(selector),
    ).filter((element) => {
        if (element.hasAttribute('disabled')) {
            return false;
        }

        if (element.getAttribute('aria-hidden') === 'true') {
            return false;
        }

        return !(
            element.tabIndex < 0 ||
            element.hidden
        );
    });
};

const joinIds = (
    ...values: Array<string | undefined>
): string | undefined => {
    const normalized = values
        .map(value => value?.trim())
        .filter(Boolean) as string[];

    if (normalized.length === 0) {
        return undefined;
    }

    return Array.from(new Set(normalized)).join(' ');
};

export function Modal({
    open,
    onClose,
    title,
    footer,
    children,
    size = 'md',
    closeOnBackdropClick = true,
    closeOnEsc = true,
    showCloseButton = false,
    ariaLabel,
    trapFocus = true,
    lockScroll = true,
    restoreFocus = true,
    initialFocusRef,
    finalFocusRef,
    closeButtonLabel,
    overlayProps,
    contentProps,
}: ModalProps): JSX.Element | ReactPortal | null {
    const titleId = useId();
    const descriptionId = useId();

    const dialogRef = useRef<HTMLDivElement | null>(null);
    const previousActiveElementRef =
        useRef<HTMLElement | null>(null);

    const resolvedCloseButtonLabel =
        closeButtonLabel ??
        t('common.close', {
            defaultValue: 'Close',
        });

    useEffect(() => {
        if (!open || typeof document === 'undefined') {
            return;
        }

        previousActiveElementRef.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        const body = document.body;
        const previousOverflow = body.style.overflow;

        if (lockScroll) {
            body.style.overflow = 'hidden';
        }

        const focusTarget = (): void => {
            const explicitTarget = initialFocusRef?.current;

            if (explicitTarget) {
                explicitTarget.focus();
                return;
            }

            const dialogNode = dialogRef.current;
            if (!dialogNode) {
                return;
            }

            const focusable = getFocusableElements(dialogNode);

            if (focusable.length > 0) {
                focusable[0].focus();
                return;
            }

            dialogNode.focus();
        };

        const frame = window.requestAnimationFrame(focusTarget);

        return () => {
            window.cancelAnimationFrame(frame);

            if (lockScroll) {
                body.style.overflow = previousOverflow;
            }

            if (restoreFocus) {
                const target =
                    finalFocusRef?.current ??
                    previousActiveElementRef.current;

                target?.focus?.();
            }
        };
    }, [
        open,
        lockScroll,
        restoreFocus,
        initialFocusRef,
        finalFocusRef,
    ]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handleKeyDown = (
            event: KeyboardEvent,
        ): void => {
            if (event.key === 'Escape' && closeOnEsc) {
                event.stopPropagation();
                onClose?.();
                return;
            }

            if (event.key !== 'Tab' || !trapFocus) {
                return;
            }

            const dialogNode = dialogRef.current;
            if (!dialogNode) {
                return;
            }

            const focusable = getFocusableElements(dialogNode);

            if (focusable.length === 0) {
                event.preventDefault();
                dialogNode.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeElement = document.activeElement;

            if (event.shiftKey && activeElement === first) {
                event.preventDefault();
                last.focus();
                return;
            }

            if (!event.shiftKey && activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, closeOnEsc, trapFocus, onClose]);

    if (!open) {
        return null;
    }

    const {
        className: overlayClassName,
        onMouseDown: overlayOnMouseDown,
        ...overlayRestProps
    } = overlayProps ?? {};

    const {
        className: contentClassName,
        onKeyDown: contentOnKeyDown,
        'aria-describedby': contentAriaDescribedBy,
        'aria-labelledby': contentAriaLabelledBy,
        ...contentRestProps
    } = contentProps ?? {};

    const handleBackdropMouseDown = (
        event: ReactMouseEvent<HTMLDivElement>,
    ): void => {
        overlayOnMouseDown?.(event);

        if (event.defaultPrevented) {
            return;
        }

        if (!closeOnBackdropClick) {
            return;
        }

        if (event.target !== event.currentTarget) {
            return;
        }

        onClose?.();
    };

    const handleDialogKeyDown = (
        event: ReactKeyboardEvent<HTMLDivElement>,
    ): void => {
        contentOnKeyDown?.(event);

        if (event.defaultPrevented) {
            return;
        }

        if (event.key === 'Escape' && closeOnEsc) {
            event.stopPropagation();
            onClose?.();
        }
    };

    const resolvedOverlayClassName = joinClassNames(
        'ui-modal-overlay',
        overlayClassName,
    );

    const resolvedDialogClassName = joinClassNames(
        'ui-modal',
        `ui-modal--size-${size}`,
        contentClassName,
    );

    const resolvedAriaLabelledBy = joinIds(
        contentAriaLabelledBy,
        !ariaLabel && title ? titleId : undefined,
    );

    const resolvedAriaDescribedBy = joinIds(
        contentAriaDescribedBy,
        children ? descriptionId : undefined,
    );

    const modalNode = (
        <div
            className={resolvedOverlayClassName}
            onMouseDown={handleBackdropMouseDown}
            {...overlayRestProps}
        >
            <div
                ref={dialogRef}
                className={resolvedDialogClassName}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                aria-labelledby={resolvedAriaLabelledBy}
                aria-describedby={resolvedAriaDescribedBy}
                tabIndex={-1}
                onKeyDown={handleDialogKeyDown}
                {...contentRestProps}
            >
                {(title || showCloseButton) ? (
                    <div className="ui-modal__header">
                        {title ? (
                            typeof title === 'string' ? (
                                <h2
                                    id={titleId}
                                    className="ui-modal__title"
                                >
                                    {title}
                                </h2>
                            ) : (
                                <div id={titleId}>
                                    {title}
                                </div>
                            )
                        ) : null}

                        {showCloseButton ? (
                            <button
                                type="button"
                                className="ui-modal__close"
                                aria-label={resolvedCloseButtonLabel}
                                title={resolvedCloseButtonLabel}
                                onClick={() => onClose?.()}
                            >
                                ×
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {children ? (
                    <div
                        id={descriptionId}
                        className="ui-modal__body"
                    >
                        {children}
                    </div>
                ) : null}

                {footer ? (
                    <div className="ui-modal__footer">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );

    if (typeof document === 'undefined' || !document.body) {
        return modalNode;
    }

    return createPortal(modalNode, document.body);
}