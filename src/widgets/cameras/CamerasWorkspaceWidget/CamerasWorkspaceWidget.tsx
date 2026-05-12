// =====================
// File: src/widgets/cameras/CamerasWorkspaceWidget/CamerasWorkspaceWidget.tsx
// Purpose:
//   Workspace камер под новый контракт:
//   - filters
//   - fixed table
//   - pagination
//   - delete in row actions
//   Без bulk / selection / visible columns / health summary.
// =====================

import type { JSX } from 'react';

import {
    Card,
    Heading,
    Stack,
    Text,
} from '../../../shared/ui';

import { useCamerasWorkspaceWidget } from './hooks';
import type { CamerasWorkspaceWidgetProps } from './types';
import { CameraFiltersSection } from './ui/CameraFiltersSection';
import { CamerasTableSection } from './ui/CamerasTableSection';
import styles from './ui/CamerasWorkspaceWidget.module.css';

export function CamerasWorkspaceWidget(
    props: CamerasWorkspaceWidgetProps,
): JSX.Element {
    const {
        className,
        pageSizeOptions,
        maxRealtimeItems: _maxRealtimeItems,
        onOpenCameraDetails,
        ...rest
    } = props;

    const viewModel = useCamerasWorkspaceWidget({
        pageSizeOptions,
        onOpenCameraDetails,
    });

    return (
        <Stack
            className={className}
            gap={20}
            {...rest}
        >
            <div className={styles.workspaceRoot}>
                <Stack gap={20}>
                    <Card
                        variant="default"
                        padding="md"
                    >
                        <div className={styles.workspaceHeroCard}>
                            <div className={styles.workspaceHeroHeader}>
                                <div className={styles.workspaceHeroTitleBlock}>
                                    <Heading level={2}>
                                        {viewModel.title}
                                    </Heading>

                                    {viewModel.subtitle ? (
                                        <Text variant="muted">
                                            {viewModel.subtitle}
                                        </Text>
                                    ) : null}
                                </div>

                                {viewModel.syncMetaText ? (
                                    <div className={styles.workspaceHeroMeta}>
                                        <div className={styles.selectionMeta}>
                                            <Text variant="caption">
                                                {viewModel.syncMetaText}
                                            </Text>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </Card>

                    <div className={styles.workspaceLayout}>
                        <div className={styles.workspaceSidebar}>
                            <CameraFiltersSection
                                title={viewModel.sections.filters.title}
                                subtitle={viewModel.sections.filters.subtitle}
                                values={viewModel.filters.values}
                                siteOptions={viewModel.filters.siteOptions}
                                siteSearchLoading={viewModel.filters.siteSearchLoading}
                                statusOptions={viewModel.filters.statusOptions}
                                setSiteQuery={viewModel.filters.setSiteQuery}
                                selectSite={viewModel.filters.selectSite}
                                clearSiteSelection={viewModel.filters.clearSiteSelection}
                                setSearch={viewModel.filters.setSearch}
                                toggleStatus={viewModel.filters.toggleStatus}
                                apply={viewModel.filters.apply}
                                reset={viewModel.filters.reset}
                                restore={viewModel.filters.restore}
                            />
                        </div>

                        <div className={styles.workspaceMain}>
                            {viewModel.isError ? (
                                <Card
                                    variant="default"
                                    padding="md"
                                >
                                    <Stack gap={8}>
                                        <Heading level={3}>
                                            {viewModel.errorTitle}
                                        </Heading>

                                        <Text variant="muted">
                                            {viewModel.errorSubtitle}
                                        </Text>
                                    </Stack>
                                </Card>
                            ) : viewModel.isLoading && viewModel.table.rows.length === 0 ? (
                                <Card
                                    variant="default"
                                    padding="md"
                                >
                                    <Text variant="muted">
                                        {viewModel.loadingLabel}
                                    </Text>
                                </Card>
                            ) : (
                                <CamerasTableSection
                                    title={viewModel.sections.table.title}
                                    subtitle={viewModel.sections.table.subtitle}
                                    rows={viewModel.table.rows}
                                    total={viewModel.table.total}
                                    page={viewModel.table.page}
                                    pageSize={viewModel.table.pageSize}
                                    totalPages={viewModel.table.totalPages}
                                    pageSizeOptions={viewModel.table.pageSizeOptions}
                                    deletingCameraId={viewModel.table.deletingCameraId}
                                    deleteErrorMessage={viewModel.table.deleteErrorMessage}
                                    setPage={viewModel.table.setPage}
                                    setPageSize={viewModel.table.setPageSize}
                                    openDetails={viewModel.table.openDetails}
                                    deleteCamera={viewModel.table.deleteCamera}
                                />
                            )}
                        </div>
                    </div>
                </Stack>
            </div>
        </Stack>
    );
}