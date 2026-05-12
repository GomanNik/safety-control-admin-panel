// =====================
// File: src/widgets/cameras/CamerasWorkspaceWidget/ui/CamerasTableSection.tsx
// Purpose:
//   Фиксированная таблица камер:
//   - name
//   - site
//   - location
//   - status
//   - lastSeenAt
//   - open / delete row actions
//   Без selection / visible columns.
// =====================

import type { JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import {
    Button,
    Card,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';

import type {
    CameraTableBadgeCellVM,
    CameraTableCellVM,
    CameraTableColumnId,
    CameraTableRowVM,
} from '../../../../features/camera';
import {
    CAMERA_TABLE_COLUMN_IDS,
} from '../../../../features/camera';
import styles from './CamerasWorkspaceWidget.module.css';

interface CamerasTableSectionProps {
    title: string;
    subtitle?: string;
    rows: CameraTableRowVM[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    pageSizeOptions: number[];
    deletingCameraId: CameraTableRowVM['id'] | null;
    deleteErrorMessage: string | null;
    setPage(nextPage: number): void;
    setPageSize(nextPageSize: number): void;
    openDetails(id: CameraTableRowVM['id']): void;
    deleteCamera(id: CameraTableRowVM['id']): Promise<void>;
}

const getBadgeToneClassName = (
    tone: CameraTableBadgeCellVM['tone'],
): string => {
    switch (tone) {
        case 'success':
            return styles.cellBadgeSuccess;
        case 'warning':
            return styles.cellBadgeWarning;
        case 'critical':
            return styles.cellBadgeCritical;
        case 'neutral':
        default:
            return styles.cellBadgeNeutral;
    }
};

const getColumnLabel = (
    columnId: CameraTableColumnId,
    t: ReturnType<typeof useI18nContext>['t'],
): string => {
    switch (columnId) {
        case 'name':
            return t('camera.workspace.table.columns.name');
        case 'site':
            return t('camera.workspace.table.columns.site');
        case 'location':
            return t('camera.workspace.table.columns.location');
        case 'status':
            return t('camera.workspace.table.columns.status');
        case 'lastSeenAt':
            return t('camera.workspace.table.columns.lastSeenAt');
        default:
            return t('common.unknown');
    }
};

function renderCell(
    cell: CameraTableCellVM | undefined,
    fallbackLabel: string,
): JSX.Element {
    if (!cell) {
        return (
            <Text as="span">
                {fallbackLabel}
            </Text>
        );
    }

    if (cell.kind === 'badge') {
        return (
            <span
                className={[
                    styles.cellBadge,
                    getBadgeToneClassName(cell.tone),
                ].join(' ')}
                title={cell.title}
            >
                {cell.text}
            </span>
        );
    }

    return (
        <span
            className={styles.cellText}
            title={cell.title}
        >
            {cell.text}
        </span>
    );
}

export function CamerasTableSection(
    props: CamerasTableSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        rows,
        total,
        page,
        pageSize,
        totalPages,
        pageSizeOptions,
        deletingCameraId,
        deleteErrorMessage,
        setPage,
        setPageSize,
        openDetails,
        deleteCamera,
    } = props;

    const { t } = useI18nContext();
    const notAvailableLabel = t('common.notAvailable');

    return (
        <Card
            variant="default"
            padding="md"
            header={(
                <div className={styles.sectionHeader}>
                    <Heading level={3}>
                        {title}
                    </Heading>

                    {subtitle ? (
                        <Text variant="muted">
                            {subtitle}
                        </Text>
                    ) : null}
                </div>
            )}
        >
            <Stack gap={16}>
                <div className={styles.tableTopBar}>
                    <Text>
                        {t('camera.workspace.table.total')}: {total}
                    </Text>

                    <label className={styles.inlineMetaRow}>
                        <Text variant="caption">
                            {t('camera.workspace.table.pageSize')}
                        </Text>

                        <select
                            className={styles.control}
                            value={pageSize}
                            onChange={(event) => {
                                const nextPageSize = Number(event.target.value);

                                if (!Number.isFinite(nextPageSize)) {
                                    return;
                                }

                                setPageSize(nextPageSize);
                            }}
                        >
                            {pageSizeOptions.map((value) => (
                                <option
                                    key={value}
                                    value={value}
                                >
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {deleteErrorMessage ? (
                    <Text variant="danger">
                        {deleteErrorMessage}
                    </Text>
                ) : null}

                {rows.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Text variant="muted">
                            {t('camera.workspace.table.empty')}
                        </Text>
                    </div>
                ) : (
                    <div className={styles.tableScroll}>
                        <table className={styles.table}>
                            <thead>
                            <tr>
                                {CAMERA_TABLE_COLUMN_IDS.map((columnId) => (
                                    <th key={columnId}>
                                        {getColumnLabel(columnId, t)}
                                    </th>
                                ))}

                                <th className={styles.tableActionsCell}>
                                    {t('camera.workspace.table.actions')}
                                </th>
                            </tr>
                            </thead>

                            <tbody>
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    {CAMERA_TABLE_COLUMN_IDS.map((columnId) => (
                                        <td key={`${row.id}:${columnId}`}>
                                            {renderCell(
                                                row.cells[columnId],
                                                notAvailableLabel,
                                            )}
                                        </td>
                                    ))}

                                    <td className={styles.tableActionsCell}>
                                        <Stack
                                            direction="row"
                                            gap={8}
                                            wrap
                                        >
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    openDetails(row.id);
                                                }}
                                            >
                                                {t('camera.workspace.table.open')}
                                            </Button>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={deletingCameraId !== null}
                                                onClick={() => {
                                                    void deleteCamera(row.id);
                                                }}
                                            >
                                                {deletingCameraId === row.id
                                                    ? t('camera.workspace.table.deleting')
                                                    : t('camera.workspace.table.delete')}
                                            </Button>
                                        </Stack>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className={styles.tableBottomBar}>
                    <Text>
                        {t('camera.workspace.table.page')} {page} / {totalPages}
                    </Text>

                    <div className={styles.actionRow}>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => {
                                setPage(page - 1);
                            }}
                        >
                            {t('camera.workspace.table.previous')}
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => {
                                setPage(page + 1);
                            }}
                        >
                            {t('camera.workspace.table.next')}
                        </Button>
                    </div>
                </div>
            </Stack>
        </Card>
    );
}