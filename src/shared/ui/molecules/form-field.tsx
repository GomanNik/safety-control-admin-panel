// =====================
// File: src/shared/ui/molecules/form-field.tsx
// Purpose:
// - Form field molecule
// - Fixed label/id sync and aria-describedby generation
// =====================

import {
    cloneElement,
    isValidElement,
    useId,
} from 'react';
import type {
    HTMLAttributes,
    JSX,
    ReactElement,
    ReactNode,
} from 'react';
import { joinClassNames } from '../classNames';

export interface FormFieldControlProps {
    id: string;
    required?: boolean;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
}

export interface FormFieldProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    /**
     * Подпись к полю.
     */
    label?: ReactNode;

    /**
     * Явный id контрола.
     * Если не передан, будет сгенерирован или взят из дочернего элемента.
     */
    controlId?: string;

    /**
     * @deprecated Используй controlId.
     */
    labelFor?: string;

    /**
     * Дополнительный текст-подсказка.
     */
    helpText?: ReactNode;

    /**
     * Текст ошибки.
     */
    error?: ReactNode;

    /**
     * Обязательность поля.
     */
    required?: boolean;

    /**
     * Кастомный маркер обязательности.
     */
    requiredMark?: ReactNode;

    /**
     * Контрол поля.
     */
    children?:
        | ReactNode
        | ((controlProps: FormFieldControlProps) => ReactNode);
}

type FormFieldInternalProps = Omit<FormFieldProps, 'labelFor'> & {
    labelFor?: string;
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

export function FormField(props: FormFieldProps): JSX.Element;
export function FormField({
    label,
    controlId,
    labelFor,
    helpText,
    error,
    required,
    requiredMark,
    children,
    className,
    ...rest
}: FormFieldInternalProps): JSX.Element {
    const fallbackId = useId();

    const childElement =
        typeof children === 'function' || !isValidElement(children)
            ? null
            : (children as ReactElement<Record<string, unknown>>);

    const childExistingId =
        childElement &&
        typeof childElement.props.id === 'string'
            ? childElement.props.id
            : undefined;

    const resolvedControlId =
        controlId ??
        labelFor ??
        childExistingId ??
        fallbackId;

    const hasError = Boolean(error);

    const renderedHelpTextId =
        helpText && !hasError
            ? `${resolvedControlId}-help`
            : undefined;

    const renderedErrorId =
        hasError
            ? `${resolvedControlId}-error`
            : undefined;

    const rootClassName = joinClassNames(
        'ui-form-field',
        hasError && 'ui-form-field--error',
        className,
    );

    const baseControlProps: FormFieldControlProps = {
        id: resolvedControlId,
        required: required || undefined,
        'aria-invalid': hasError ? true : undefined,
        'aria-describedby': joinIds(
            renderedHelpTextId,
            renderedErrorId,
        ),
    };

    const renderControl = (): ReactNode => {
        if (typeof children === 'function') {
            return children(baseControlProps);
        }

        if (!childElement) {
            return children;
        }

        const existingAriaDescribedBy =
            typeof childElement.props['aria-describedby'] === 'string'
                ? (childElement.props['aria-describedby'] as string)
                : undefined;

        const mergedControlProps: Record<string, unknown> = {
            id: resolvedControlId,
            required:
                childElement.props.required ??
                baseControlProps.required,
            'aria-invalid':
                childElement.props['aria-invalid'] ??
                baseControlProps['aria-invalid'],
            'aria-describedby': joinIds(
                existingAriaDescribedBy,
                baseControlProps['aria-describedby'],
            ),
        };

        return cloneElement(
            childElement,
            mergedControlProps,
        );
    };

    return (
        <div className={rootClassName} {...rest}>
            {label ? (
                <label
                    className="ui-form-field__label"
                    htmlFor={resolvedControlId}
                >
                    {label}
                    {required ? (
                        <span className="ui-form-field__required-mark">
                            {requiredMark ?? '*'}
                        </span>
                    ) : null}
                </label>
            ) : null}

            <div className="ui-form-field__control">
                {renderControl()}
            </div>

            {renderedHelpTextId ? (
                <div
                    id={renderedHelpTextId}
                    className="ui-form-field__help-text"
                >
                    {helpText}
                </div>
            ) : null}

            {renderedErrorId ? (
                <div
                    id={renderedErrorId}
                    className="ui-form-field__error"
                    role="alert"
                >
                    {error}
                </div>
            ) : null}
        </div>
    );
}