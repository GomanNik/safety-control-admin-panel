// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/types.ts
// Purpose:
// - Public view-model contracts for DashboardWorkspaceWidget
// - Keeps incident report workflow at widget/page level
// - Keeps incidents trend section focused on period + chart only
// =====================

import type { OverviewDashboardScope } from '../../../features/common';
import type { SiteId } from '../../../shared/api';

export type DashboardWidgetTone =
    | 'neutral'
    | 'success'
    | 'warning'
    | 'critical'
    | 'info';

export interface DashboardWorkspaceWidgetProps {
    scope?: OverviewDashboardScope;
    onOpenSiteDetails?: (siteId: SiteId) => void;
    onCreateSite?: () => void;
}

export interface DashboardKpiItemViewModel {
    key: string;
    title: string;
    value: string;
    meta: string;
    tone: DashboardWidgetTone;
}

export interface DashboardKpiSectionViewModel {
    title: string;
    subtitle: string;
    items: ReadonlyArray<DashboardKpiItemViewModel>;
}

export interface DashboardSectionHelpItemViewModel {
    label: string;
    description: string;
}

export interface DashboardSectionHelpViewModel {
    buttonAriaLabel: string;
    closeLabel: string;
    title: string;
    description?: string;
    items: ReadonlyArray<DashboardSectionHelpItemViewModel>;
}

export interface DashboardSiteHealthItemViewModel {
    siteId: string;
    name: string;
    subtitle?: string;

    tone: DashboardWidgetTone;
    statusTone: DashboardWidgetTone;
    healthTone: DashboardWidgetTone;

    statusLabel: string;
    healthLabel: string;

    camerasLabel: string;
    attentionLabel: string;
    incidentsLabel: string;
}

export interface DashboardSitesHealthSectionViewModel {
    title: string;
    subtitle: string;
    periodLabel?: string;
    help: DashboardSectionHelpViewModel;
    emptyLabel: string;
    items: ReadonlyArray<DashboardSiteHealthItemViewModel>;
}

export interface DashboardCameraDigestItemViewModel {
    cameraId: string;
    name: string;

    tone: DashboardWidgetTone;
    stateLabel: string;
    reasonLabel: string;

    statusLabel: string;
    healthLabel: string;
    lastSeenLabel: string;
    incidentsLabel: string;
    inferenceLabel: string;
}

export interface DashboardCameraSiteGroupViewModel {
    siteId: string;
    name: string;
    subtitle?: string;

    onlineValue: string;
    attentionValue: string;
    incidentsValue: string;

    displayedCamerasLabel?: string;

    expandLabel: string;
    collapseLabel: string;

    cameras: ReadonlyArray<DashboardCameraDigestItemViewModel>;
}

export interface DashboardCamerasBySiteSectionViewModel {
    title: string;
    subtitle: string;
    periodLabel?: string;
    createActionLabel?: string;
    help?: DashboardSectionHelpViewModel;
    emptyLabel: string;
    groups: ReadonlyArray<DashboardCameraSiteGroupViewModel>;
}

export interface DashboardDateRangePresetViewModel {
    key: '7d' | '30d';
    label: string;
    isActive: boolean;
}

export interface DashboardDateRangePickerViewModel {
    buttonLabel: string;
    title: string;
    fromLabel: string;
    toLabel: string;
    applyLabel: string;
    presets: ReadonlyArray<DashboardDateRangePresetViewModel>;
    fromValue: string;
    toValue: string;
    minDateValue: string;
    maxDateValue: string;
    maxRangeDays: number;
    onApply(next: {
        from: string;
        to: string;
    }): void;
    onPresetSelect(key: '7d' | '30d'): void;
}

export interface DashboardTrendPointViewModel {
    key: string;
    label: string;
    count: number;
    countLabel: string;
}

export type DashboardIncidentReportSitesMode =
    | 'all'
    | 'selected';

export type DashboardIncidentReportMediaMode =
    | 'linksOnly'
    | 'videosOrLinks';

export interface DashboardIncidentReportSiteOptionViewModel {
    siteId: string;
    name: string;
    subtitle?: string;
    checked: boolean;
    disabled?: boolean;
}

export interface DashboardIncidentReportMediaOptionViewModel {
    value: DashboardIncidentReportMediaMode;
    label: string;
}

export interface DashboardIncidentReportModalViewModel {
    open: boolean;

    title: string;
    subtitle?: string;

    fromLabel: string;
    toLabel: string;
    fromValue: string;
    toValue: string;
    minDateValue: string;
    maxDateValue: string;

    sitesModeLabel: string;
    allSitesLabel: string;
    selectedSitesLabel: string;
    sitesMode: DashboardIncidentReportSitesMode;

    sitesLabel: string;
    sitesEmptyLabel: string;
    selectedSitesSummary?: string;
    siteOptions: ReadonlyArray<DashboardIncidentReportSiteOptionViewModel>;

    mediaModeLabel: string;
    mediaMode: DashboardIncidentReportMediaMode;
    mediaOptions: ReadonlyArray<DashboardIncidentReportMediaOptionViewModel>;

    cancelLabel: string;
    submitLabel: string;

    validationMessage?: string;
    isSubmitDisabled: boolean;
    isSubmitting: boolean;

    onClose(): void;
    onFromChange(value: string): void;
    onToChange(value: string): void;
    onSitesModeChange(value: DashboardIncidentReportSitesMode): void;
    onToggleSite(siteId: string): void;
    onMediaModeChange(value: DashboardIncidentReportMediaMode): void;
    onSubmit(): void;
}

export interface DashboardIncidentReportActionViewModel {
    label: string;
    disabled?: boolean;
    isLoading?: boolean;
    onClick(): void;
}

export interface DashboardIncidentsTrendSectionViewModel {
    title: string;
    subtitle: string;

    period: DashboardDateRangePickerViewModel;
    summaryLabel: string;

    chartEmptyLabel: string;
    chartAxisXLabel: string;
    chartAxisYLabel: string;

    points: ReadonlyArray<DashboardTrendPointViewModel>;
}

export interface DashboardWorkspaceWidgetState {
    isLoading: boolean;
    isFetching: boolean;
    isEmpty: boolean;
    hasPartialData: boolean;
    error: unknown | null;
}

export interface DashboardWorkspaceWidgetModel {
    title: string;
    subtitle: string;

    partialErrorTitle: string;
    partialErrorSubtitle: string;

    loadingTitle: string;
    loadingSubtitle: string;

    emptyTitle: string;
    emptySubtitle: string;

    state: DashboardWorkspaceWidgetState;

    kpiSection: DashboardKpiSectionViewModel;
    sitesHealthSection: DashboardSitesHealthSectionViewModel;
    camerasBySiteSection: DashboardCamerasBySiteSectionViewModel;
    incidentsTrendSection: DashboardIncidentsTrendSectionViewModel;

    reportAction?: DashboardIncidentReportActionViewModel;
    reportModal?: DashboardIncidentReportModalViewModel;
}