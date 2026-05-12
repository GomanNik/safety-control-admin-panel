// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/DashboardWorkspaceWidget.tsx
// Purpose:
// - Root overview dashboard widget renderer
// - Shows incident report action in page header instead of chart section
// - Renders incident report modal at widget/page level
// =====================

import type { JSX } from 'react';

import {
    Button,
    Card,
    Stack,
    Text,
} from '../../../shared/ui';
import { HttpErrorWidget } from '../../errors';

import type { DashboardWorkspaceWidgetProps } from './types';
import { useDashboardWorkspaceWidget } from './model/useDashboardWorkspaceWidget';
import { DashboardCamerasBySiteSection } from './ui/DashboardCamerasBySiteSection';
import { DashboardIncidentReportModal } from './ui/DashboardIncidentReportModal';
import { DashboardIncidentsTrendSection } from './ui/DashboardIncidentsTrendSection';
import { DashboardKpiSection } from './ui/DashboardKpiSection';
import { DashboardSitesHealthSection } from './ui/DashboardSitesHealthSection';

import './DashboardWorkspaceWidget.css';

export function DashboardWorkspaceWidget(
    props: DashboardWorkspaceWidgetProps,
): JSX.Element {
    const model = useDashboardWorkspaceWidget(props);

    const showBlockingError =
        Boolean(model.state.error) &&
        model.state.isEmpty &&
        !model.state.isLoading;

    return (
        <section className="dashboard-workspace-widget ui-workspace">
            <Stack
                gap={24}
                className="ui-workspace__stack"
            >
                <header className="ui-workspace__header">
                    <div className="dashboard-workspace-widget__page-header">
                        <div className="ui-workspace__header-copy">
                            <h1 className="ui-workspace__title">
                                {model.title}
                            </h1>
                            <Text
                                variant="muted"
                                className="ui-workspace__subtitle"
                            >
                                {model.subtitle}
                            </Text>
                        </div>

                        {model.reportAction ? (
                            <div className="dashboard-workspace-widget__header-actions">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="dashboard-workspace-widget__header-action-button"
                                    disabled={model.reportAction.disabled}
                                    isLoading={model.reportAction.isLoading}
                                    onClick={model.reportAction.onClick}
                                >
                                    {model.reportAction.label}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </header>

                {showBlockingError ? (
                    <HttpErrorWidget
                        error={model.state.error}
                        defaultShowDetails={import.meta.env.DEV}
                    />
                ) : null}

                {!showBlockingError && model.state.hasPartialData ? (
                    <Card
                        variant="outlined"
                        padding="md"
                        className="ui-workspace__warning-banner"
                    >
                        <div className="ui-workspace__warning-banner-content">
                            <div>
                                <div className="ui-workspace__warning-title">
                                    {model.partialErrorTitle}
                                </div>
                                <Text
                                    variant="muted"
                                    className="ui-workspace__warning-subtitle"
                                >
                                    {model.partialErrorSubtitle}
                                </Text>
                            </div>
                        </div>
                    </Card>
                ) : null}

                {!showBlockingError && model.state.isLoading && model.state.isEmpty ? (
                    <Card
                        variant="elevated"
                        padding="lg"
                        className="ui-workspace__state-card"
                    >
                        <div className="ui-workspace__state-title">
                            {model.loadingTitle}
                        </div>
                        <Text
                            variant="muted"
                            className="ui-workspace__state-subtitle"
                        >
                            {model.loadingSubtitle}
                        </Text>
                    </Card>
                ) : null}

                {!showBlockingError && !model.state.isLoading && model.state.isEmpty ? (
                    <Card
                        variant="elevated"
                        padding="lg"
                        className="ui-workspace__state-card"
                    >
                        <div className="ui-workspace__state-title">
                            {model.emptyTitle}
                        </div>
                        <Text
                            variant="muted"
                            className="ui-workspace__state-subtitle"
                        >
                            {model.emptySubtitle}
                        </Text>
                    </Card>
                ) : null}

                {!showBlockingError && !model.state.isEmpty ? (
                    <>
                        <DashboardKpiSection
                            section={model.kpiSection}
                        />

                        <div className="ui-workspace__two-column">
                            <DashboardSitesHealthSection
                                section={model.sitesHealthSection}
                                onOpenSiteDetails={props.onOpenSiteDetails}
                            />
                            <DashboardIncidentsTrendSection
                                section={model.incidentsTrendSection}
                            />
                        </div>

                        <DashboardCamerasBySiteSection
                            section={model.camerasBySiteSection}
                            onOpenSiteDetails={props.onOpenSiteDetails}
                            onCreateSite={props.onCreateSite}
                        />
                    </>
                ) : null}
            </Stack>

            {model.reportModal ? (
                <DashboardIncidentReportModal modal={model.reportModal} />
            ) : null}
        </section>
    );
}