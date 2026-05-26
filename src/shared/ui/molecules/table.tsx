// =====================
// File: src/shared/ui/molecules/table.tsx
// Purpose:
// - Table molecule
// - Added keyboard accessibility for clickable rows
// =====================

import type {
    JSX,
    KeyboardEvent as ReactKeyboardEvent,
    ReactNode,
    TableHTMLAttributes,
} from 'react';
import { joinClassNames } from '../classNames';

export interface TableColumn<T> {
    key: string;
    header: ReactNode;

    /**
     * Рендер содержимого ячейки.
     */
    render?: (row: T, index: number) => ReactNode;

    /**
     * Дополнительный className для ячеек колонки.
     */
    className?: string;

    /**
     * Выравнивание содержимого.
     */
    align?: 'left' | 'center' | 'right';

    /**
     * Делает body-cell семантическим row header.
     */
    isRowHeader?: boolean;
}

export interface TableProps<T>
    extends Omit<
        TableHTMLAttributes<HTMLTableElement>,
        'children'
    > {
    columns: TableColumn<T>[];
    data: T[];

    /**
     * Подпись таблицы для семантики.
     */
    caption?: ReactNode;

    /**
     * Ключ строки.
     */
    getRowKey?: (
        row: T,
        index: number,
    ) => string;

    /**
     * Состояние "нет данных".
     */
    emptyState?: ReactNode;

    /**
     * Класс строки.
     */
    rowClassName?: (
        row: T,
        index: number,
    ) => string | undefined;

    /**
     * Обработчик клика по строке.
     */
    onRowClick?: (
        row: T,
        index: number,
    ) => void;
}

export function Table<T>({
    columns,
    data,
    caption,
    className,
    getRowKey,
    emptyState,
    rowClassName,
    onRowClick,
    ...rest
}: TableProps<T>): JSX.Element {
    const resolveKey = (
        row: T,
        index: number,
    ): string => {
        if (getRowKey) {
            return getRowKey(row, index);
        }

        return String(index);
    };

    const rootClassName = joinClassNames(
        'ui-table',
        className,
    );

    const resolveCellClassName = (
        column: TableColumn<T>,
        isHeader: boolean,
    ): string => {
        return joinClassNames(
            'ui-table__cell',
            isHeader && 'ui-table__cell--head',
            column.align &&
            `ui-table__cell--align-${column.align}`,
            column.className,
        );
    };

    const handleRowKeyDown = (
        event: ReactKeyboardEvent<HTMLTableRowElement>,
        row: T,
        rowIndex: number,
    ): void => {
        if (!onRowClick) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onRowClick(row, rowIndex);
        }
    };

    return (
        <table className={rootClassName} {...rest}>
            {caption ? <caption>{caption}</caption> : null}

            <thead className="ui-table__head">
                <tr className="ui-table__row ui-table__row--head">
                    {columns.map((column) => (
                        <th
                            key={column.key}
                            scope="col"
                            className={resolveCellClassName(
                                column,
                                true,
                            )}
                        >
                            {column.header}
                        </th>
                    ))}
                </tr>
            </thead>

            <tbody className="ui-table__body">
                {data.length === 0 && emptyState ? (
                    <tr className="ui-table__row ui-table__row--empty">
                        <td
                            className="ui-table__cell ui-table__cell--empty"
                            colSpan={columns.length}
                        >
                            {emptyState}
                        </td>
                    </tr>
                ) : null}

                {data.map((row, rowIndex) => {
                    const rowKey = resolveKey(row, rowIndex);
                    const isClickable = typeof onRowClick === 'function';

                    const trClassName = joinClassNames(
                        'ui-table__row',
                        isClickable && 'ui-table__row--clickable',
                        rowClassName?.(row, rowIndex),
                    );

                    return (
                        <tr
                            key={rowKey}
                            className={trClassName}
                            onClick={
                                isClickable
                                    ? () => onRowClick(row, rowIndex)
                                    : undefined
                            }
                            onKeyDown={
                                isClickable
                                    ? (event) => handleRowKeyDown(event, row, rowIndex)
                                    : undefined
                            }
                            tabIndex={isClickable ? 0 : undefined}
                        >
                            {columns.map((column) => {
                                const content = column.render
                                    ? column.render(row, rowIndex)
                                    : null;

                                if (column.isRowHeader) {
                                    return (
                                        <th
                                            key={column.key}
                                            scope="row"
                                            className={resolveCellClassName(
                                                column,
                                                false,
                                            )}
                                        >
                                            {content}
                                        </th>
                                    );
                                }

                                return (
                                    <td
                                        key={column.key}
                                        className={resolveCellClassName(
                                            column,
                                            false,
                                        )}
                                    >
                                        {content}
                                    </td>
                                );
                            })}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}