// =====================
// src/widgets/incidents/IncidentsWorkspaceWidget/ui/IncidentTableSection.tsx
// =====================

import type { JSX } from 'react';

import {
    IncidentSortField,
    SortDirection,
} from '../../../../entities/incident';
import { useI18nContext } from '../../../../shared/i18n';
import {
    Button,
    Card,
    Heading,
    Stack,
    Table,
    Text,
} from '../../../../shared/ui';

import type { IncidentsWorkspaceTableSectionView } from '../types';

interface IncidentTableSectionProps {
    title: string;
    subtitle?: string;
    view: IncidentsWorkspaceTableSectionView;
}

function getSortIndicator(
    field: IncidentSortField,
    activeSortField: IncidentSortField | undefined,
    activeSortDirection: SortDirection | undefined,
): string {
    if (field !== activeSortField) {
        return '';
    }

    return activeSortDirection === SortDirection.Asc
        ? ' ↑'
        : ' ↓';
}

export function IncidentTableSection(
    props: IncidentTableSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        view,
    } = props;

    const { t } = useI18nContext();

    const columns = [
        {
            key: 'eventTime',
            header: (
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => view.onSort(IncidentSortField.EventTime)}
                >
                    {t('incidents.workspace.table.columns.eventTime')}
                    {getSortIndicator(
                        IncidentSortField.EventTime,
                        view.activeSortField,
                        view.activeSortDirection,
                    )}
                </Button>
            ),
            render: (row: typeof view.rows[number]) => row.eventTime,
            align: 'left' as const,
        },
        {
            key: 'site',
            header: (
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => view.onSort(IncidentSortField.Site)}
                >
                    {t('incidents.workspace.table.columns.site')}
                    {getSortIndicator(
                        IncidentSortField.Site,
                        view.activeSortField,
                        view.activeSortDirection,
                    )}
                </Button>
            ),
            render: (row: typeof view.rows[number]) => row.siteName,
            align: 'left' as const,
        },
        {
            key: 'camera',
            header: (
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => view.onSort(IncidentSortField.Camera)}
                >
                    {t('incidents.workspace.table.columns.camera')}
                    {getSortIndicator(
                        IncidentSortField.Camera,
                        view.activeSortField,
                        view.activeSortDirection,
                    )}
                </Button>
            ),
            render: (row: typeof view.rows[number]) => row.cameraName,
            align: 'left' as const,
        },
        {
            key: 'severity',
            header: (
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => view.onSort(IncidentSortField.Severity)}
                >
                    {t('incidents.workspace.table.columns.severity')}
                    {getSortIndicator(
                        IncidentSortField.Severity,
                        view.activeSortField,
                        view.activeSortDirection,
                    )}
                </Button>
            ),
            render: (row: typeof view.rows[number]) => row.severity,
            align: 'left' as const,
        },
        {
            key: 'type',
            header: t('incidents.workspace.table.columns.type'),
            render: (row: typeof view.rows[number]) => row.type,
            align: 'left' as const,
        },
        {
            key: 'confidence',
            header: (
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => view.onSort(IncidentSortField.Confidence)}
                >
                    {t('incidents.workspace.table.columns.confidence')}
                    {getSortIndicator(
                        IncidentSortField.Confidence,
                        view.activeSortField,
                        view.activeSortDirection,
                    )}
                </Button>
            ),
            render: (row: typeof view.rows[number]) => row.confidenceLabel,
            align: 'right' as const,
        },
    ];

    return (
        <Card
            variant="default"
            padding="md"
            header={(
                <Stack gap={6}>
                    <Heading level={3}>
                        {title}
                    </Heading>

                    {subtitle ? (
                        <Text variant="muted">
                            {subtitle}
                        </Text>
                    ) : null}
                </Stack>
            )}
        >
            {view.isLoading ? (
                <Text>
                    {t('incidents.workspace.table.loading')}
                </Text>
            ) : view.isError ? (
                <Stack gap={12}>
                    <Text variant="danger">
                        {t('incidents.workspace.table.error')}
                    </Text>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={view.onRetry}
                    >
                        {t('incidents.workspace.common.retry')}
                    </Button>
                </Stack>
            ) : (
                <Stack gap={12}>
                    <Table
                        columns={columns}
                        data={view.rows}
                        getRowKey={(row) => row.id}
                        onRowClick={(row) => {
                            view.onOpenIncident(row.id);
                        }}
                        emptyState={t('incidents.workspace.table.empty')}
                    />

                    <Text variant="caption">
                        {t('incidents.workspace.table.pagination.summary', {
                            total: view.total,
                            currentPage: view.currentPage,
                            pageCount: view.pageCount,
                        })}
                    </Text>

                    <Stack
                        direction="row"
                        gap={8}
                    >
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={view.onPrevPage}
                            disabled={view.currentPage <= 1}
                        >
                            {t('incidents.workspace.table.pagination.previous')}
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={view.onNextPage}
                            disabled={view.currentPage >= view.pageCount}
                        >
                            {t('incidents.workspace.table.pagination.next')}
                        </Button>
                    </Stack>
                </Stack>
            )}
        </Card>
    );
}