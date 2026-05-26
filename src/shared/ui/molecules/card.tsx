// =====================
// shared/ui/molecules/card.tsx
// =====================

import type {
    HTMLAttributes,
    JSX,
    ReactNode,
} from 'react';
import { joinClassNames } from '../classNames';

export type CardVariant =
    | 'default'
    | 'elevated'
    | 'outlined'
    | 'ghost';

export type CardPadding = 'sm' | 'md' | 'lg' | 'none';

export interface CardProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
    /**
     * Основной контент карточки.
     */
    children?: ReactNode;

    /**
     * Единый слот заголовка карточки.
     * Внутри можно собрать любой нужный header самостоятельно.
     */
    header?: ReactNode;

    /**
     * Подвал карточки.
     */
    footer?: ReactNode;

    /**
     * Визуальный вариант карточки.
     */
    variant?: CardVariant;

    /**
     * Величина внутренних отступов.
     */
    padding?: CardPadding;

    /**
     * Визуальная hover-подсветка.
     * Не делает карточку интерактивной автоматически.
     */
    hoverable?: boolean;

    /**
     * @deprecated Используй hoverable.
     */
    interactive?: boolean;
}

type CardInternalProps = Omit<CardProps, 'interactive'> & {
    interactive?: boolean;
};

export function Card(props: CardProps): JSX.Element;
export function Card({
                         header,
                         footer,
                         children,
                         variant = 'default',
                         padding = 'md',
                         hoverable,
                         interactive,
                         className,
                         ...rest
                     }: CardInternalProps): JSX.Element {
    const shouldHighlightOnHover = Boolean(
        hoverable ?? interactive,
    );

    const rootClassName = joinClassNames(
        'ui-card',
        `ui-card--variant-${variant}`,
        `ui-card--padding-${padding}`,
        shouldHighlightOnHover && 'ui-card--interactive',
        className,
    );

    return (
        <div className={rootClassName} {...rest}>
            {header ? (
                <div className="ui-card__header">{header}</div>
            ) : null}

            <div className="ui-card__body">{children}</div>

            {footer ? (
                <div className="ui-card__footer">{footer}</div>
            ) : null}
        </div>
    );
}