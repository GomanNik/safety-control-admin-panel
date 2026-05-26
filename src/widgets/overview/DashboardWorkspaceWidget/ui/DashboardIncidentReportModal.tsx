// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/ui/DashboardIncidentReportModal.tsx
// Purpose:
// - Renders incident report modal UI
// - Uses only view-model passed from widget model
// - Does not own business logic or validation rules
// =====================

import type { ChangeEvent, JSX } from 'react';

import {
    Button,
    Checkbox,
    FormField,
    Grid,
    Input,
    Modal,
    Select,
    Stack,
    Text,
} from '../../../../shared/ui';

import type {
    DashboardIncidentReportMediaMode,
    DashboardIncidentReportModalViewModel,
    DashboardIncidentReportSitesMode,
} from '../types';

export interface DashboardIncidentReportModalProps {
    modal: DashboardIncidentReportModalViewModel;
}

type SitesModeSelectValue = DashboardIncidentReportSitesMode;

function buildSitesModeOptions(
    modal: DashboardIncidentReportModalViewModel,
): Array<{
    value: SitesModeSelectValue;
    label: string;
}> {
    return [
        {
            value: 'all',
            label: modal.allSitesLabel,
        },
        {
            value: 'selected',
            label: modal.selectedSitesLabel,
        },
    ];
}

export function DashboardIncidentReportModal(
    props: DashboardIncidentReportModalProps,
): JSX.Element | null {
    const { modal } = props;

    if (!modal.open) {
        return null;
    }

    return (
        <Modal
            open={modal.open}
            onClose={modal.onClose}
            title={modal.title}
            size="lg"
            showCloseButton
            footer={(
                <div className="dashboard-workspace-widget__report-footer">
                    <div className="dashboard-workspace-widget__report-summary">
                        {modal.selectedSitesSummary ? (
                            <Text variant="muted">
                                {modal.selectedSitesSummary}
                            </Text>
                        ) : null}
                    </div>

                    <div className="dashboard-workspace-widget__report-actions">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={modal.onClose}
                            disabled={modal.isSubmitting}
                        >
                            {modal.cancelLabel}
                        </Button>

                        <Button
                            type="button"
                            variant="primary"
                            isLoading={modal.isSubmitting}
                            disabled={modal.isSubmitDisabled}
                            onClick={modal.onSubmit}
                        >
                            {modal.submitLabel}
                        </Button>
                    </div>
                </div>
            )}
            contentProps={{
                className: 'dashboard-workspace-widget__report-modal',
            }}
        >
            <Stack
                gap={16}
                className="dashboard-workspace-widget__report-modal-form"
            >
                {modal.subtitle ? (
                    <Text variant="muted">
                        {modal.subtitle}
                    </Text>
                ) : null}

                <div className="dashboard-workspace-widget__report-modal-grid">
                    <Stack gap={16}>
                        <Grid
                            columns={2}
                            gap={12}
                            className="dashboard-workspace-widget__report-period-grid"
                        >
                            <FormField label={modal.fromLabel}>
                                <Input
                                    type="date"
                                    value={modal.fromValue}
                                    min={modal.minDateValue}
                                    max={modal.maxDateValue}
                                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                        modal.onFromChange(event.currentTarget.value);
                                    }}
                                />
                            </FormField>

                            <FormField label={modal.toLabel}>
                                <Input
                                    type="date"
                                    value={modal.toValue}
                                    min={modal.minDateValue}
                                    max={modal.maxDateValue}
                                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                        modal.onToChange(event.currentTarget.value);
                                    }}
                                />
                            </FormField>
                        </Grid>

                        <FormField label={modal.sitesModeLabel}>
                            <Select
                                value={modal.sitesMode}
                                options={buildSitesModeOptions(modal)}
                                onChange={(event) => {
                                    modal.onSitesModeChange(
                                        event.currentTarget.value as DashboardIncidentReportSitesMode,
                                    );
                                }}
                            />
                        </FormField>

                        <FormField label={modal.mediaModeLabel}>
                            <Select
                                value={modal.mediaMode}
                                options={modal.mediaOptions}
                                onChange={(event) => {
                                    modal.onMediaModeChange(
                                        event.currentTarget.value as DashboardIncidentReportMediaMode,
                                    );
                                }}
                            />
                        </FormField>

                        {modal.validationMessage ? (
                            <Text variant="danger">
                                {modal.validationMessage}
                            </Text>
                        ) : null}
                    </Stack>

                    <Stack gap={12}>
                        <Text
                            as="strong"
                            className="dashboard-workspace-widget__report-sites-title"
                        >
                            {modal.sitesLabel}
                        </Text>

                        {modal.sitesMode === 'selected' ? (
                            modal.siteOptions.length > 0 ? (
                                <div className="dashboard-workspace-widget__report-sites-list">
                                    <div className="dashboard-workspace-widget__report-sites-list-scroll">
                                        <Stack gap={10}>
                                            {modal.siteOptions.map((site) => (
                                                <Checkbox
                                                    key={site.siteId}
                                                    checked={site.checked}
                                                    disabled={site.disabled || modal.isSubmitting}
                                                    label={site.name}
                                                    description={site.subtitle}
                                                    onChange={() => {
                                                        modal.onToggleSite(site.siteId);
                                                    }}
                                                />
                                            ))}
                                        </Stack>
                                    </div>
                                </div>
                            ) : (
                                <div className="dashboard-workspace-widget__report-sites-empty">
                                    <Text variant="muted">
                                        {modal.sitesEmptyLabel}
                                    </Text>
                                </div>
                            )
                        ) : (
                            <div className="dashboard-workspace-widget__report-sites-empty">
                                <Text variant="muted">
                                    {modal.selectedSitesSummary ?? modal.allSitesLabel}
                                </Text>
                            </div>
                        )}
                    </Stack>
                </div>
            </Stack>
        </Modal>
    );
}