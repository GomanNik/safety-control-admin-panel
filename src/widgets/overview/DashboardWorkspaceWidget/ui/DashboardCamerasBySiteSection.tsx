// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/ui/DashboardCamerasBySiteSection.tsx
// Purpose:
// - Renders cameras by site as a master-detail section
// - Keeps the left side as compact site navigation
// - Shows the selected site's camera details in the right panel
// - Site titles are clickable and lead to site details without breaking selection behavior
// - Supports optional section-level action for site creation
// =====================

import {
    useEffect,
    useMemo,
    useState,
    type JSX,
    type KeyboardEvent,
    type MouseEvent,
} from 'react';
import { Link } from 'react-router-dom';

import {
    Button,
    Card,
    Heading,
    Text,
} from '../../../../shared/ui';
import { useTranslation } from '../../../../shared/i18n';
import { DashboardSectionHelpPopover } from '../../dashboard-section-help';

import type {
    DashboardCameraDigestItemViewModel,
    DashboardCameraSiteGroupViewModel,
    DashboardCamerasBySiteSectionViewModel,
} from '../types';

export interface DashboardCamerasBySiteSectionProps {
    section: DashboardCamerasBySiteSectionViewModel;
    onOpenSiteDetails?: (siteId: string) => void;
    onCreateSite?: () => void;
}

function buildSiteMetaItems(
    group: DashboardCameraSiteGroupViewModel,
    labels: {
        online: string;
        attention: string;
        incidents: string;
    },
): string[] {
    return [
        `${labels.online}: ${group.onlineValue}`,
        `${labels.attention}: ${group.attentionValue}`,
        `${labels.incidents}: ${group.incidentsValue}`,
    ].filter(Boolean);
}

function buildCameraMetaItems(
    camera: DashboardCameraDigestItemViewModel,
): string[] {
    return [
        camera.statusLabel,
        camera.lastSeenLabel,
        camera.incidentsLabel,
        camera.healthLabel,
    ].filter(Boolean);
}

function buildSiteDetailsHref(
    siteId: string,
): string {
    return `/sites/${encodeURIComponent(siteId)}`;
}

function handleSelectableCardKeyDown(
    event: KeyboardEvent<HTMLElement>,
    onSelect: () => void,
): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        onSelect();
    }
}

export function DashboardCamerasBySiteSection(
    props: DashboardCamerasBySiteSectionProps,
): JSX.Element {
    const {
        section,
        onOpenSiteDetails,
        onCreateSite,
    } = props;
    const { t } = useTranslation();

    const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
        () => section.groups[0]?.siteId ?? null,
    );

    useEffect(() => {
        const hasSelectedSite = section.groups.some(
            (group) => group.siteId === selectedSiteId,
        );

        if (!hasSelectedSite) {
            setSelectedSiteId(section.groups[0]?.siteId ?? null);
        }
    }, [
        section.groups,
        selectedSiteId,
    ]);

    const selectedGroup = useMemo(
        () =>
            section.groups.find((group) => group.siteId === selectedSiteId)
            ?? section.groups[0]
            ?? null,
        [
            section.groups,
            selectedSiteId,
        ],
    );

    const onlineLabel = t(
        'dashboard.sections.cameras.help.items.onlineTitle',
    );
    const attentionLabel = t(
        'dashboard.sections.cameras.help.items.attentionTitle',
    );
    const incidentsLabel = t(
        'dashboard.sections.incidents.title',
    );

    const handleSiteTitleClick = (
        event: MouseEvent<HTMLAnchorElement>,
        siteId: string,
    ): void => {
        event.stopPropagation();

        if (!onOpenSiteDetails) {
            return;
        }

        event.preventDefault();
        onOpenSiteDetails(siteId);
    };

    return (
        <Card
            variant="elevated"
            padding="md"
            className="ui-workspace__section-card"
            header={(
                <div className="ui-workspace__section-header">
                    <div className="dashboard-workspace-widget__section-toolbar">
                        <div className="dashboard-workspace-widget__section-toolbar-copy">
                            <Heading level={2} size="md">
                                {section.title}
                            </Heading>

                            <Text
                                variant="muted"
                                className="ui-workspace__section-subtitle"
                            >
                                {section.subtitle}
                            </Text>
                        </div>

                        <div className="dashboard-workspace-widget__section-toolbar-actions">
                            {section.periodLabel ? (
                                <span className="ui-status-chip">
                                    {section.periodLabel}
                                </span>
                            ) : null}

                            {onCreateSite && section.createActionLabel ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={onCreateSite}
                                >
                                    {section.createActionLabel}
                                </Button>
                            ) : null}

                            {section.help ? (
                                <DashboardSectionHelpPopover help={section.help} />
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        >
            {section.groups.length === 0 ? (
                <Text
                    variant="muted"
                    className="ui-workspace__empty-inline"
                >
                    {section.emptyLabel}
                </Text>
            ) : (
                <div className="dashboard-workspace-widget__camera-master-detail">
                    <aside className="dashboard-workspace-widget__camera-sites-nav">
                        <div className="dashboard-workspace-widget__camera-sites-nav-list">
                            {section.groups.map((group) => {
                                const isSelected = group.siteId === selectedGroup?.siteId;
                                const siteMetaItems = buildSiteMetaItems(group, {
                                    online: onlineLabel,
                                    attention: attentionLabel,
                                    incidents: incidentsLabel,
                                });
                                const siteHref = buildSiteDetailsHref(group.siteId);

                                return (
                                    <article
                                        key={group.siteId}
                                        className={[
                                            'dashboard-workspace-widget__camera-site-button',
                                            isSelected
                                                ? 'dashboard-workspace-widget__camera-site-button--selected'
                                                : '',
                                        ].filter(Boolean).join(' ')}
                                        role="button"
                                        tabIndex={0}
                                        aria-pressed={isSelected}
                                        onClick={() => {
                                            setSelectedSiteId(group.siteId);
                                        }}
                                        onKeyDown={(event) => {
                                            handleSelectableCardKeyDown(
                                                event,
                                                () => {
                                                    setSelectedSiteId(group.siteId);
                                                },
                                            );
                                        }}
                                    >
                                        <div className="dashboard-workspace-widget__camera-site-button-copy">
                                            <Heading level={3} size="sm">
                                                <Link
                                                    to={siteHref}
                                                    className="dashboard-workspace-widget__title-link"
                                                    onClick={(event) => {
                                                        handleSiteTitleClick(event, group.siteId);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        event.stopPropagation();
                                                    }}
                                                >
                                                    {group.name}
                                                </Link>
                                            </Heading>

                                            {group.subtitle ? (
                                                <Text
                                                    variant="muted"
                                                    className="dashboard-workspace-widget__entity-subtitle"
                                                >
                                                    {group.subtitle}
                                                </Text>
                                            ) : null}

                                            {siteMetaItems.length > 0 ? (
                                                <div className="dashboard-workspace-widget__camera-site-button-meta">
                                                    {siteMetaItems.map((item, index) => (
                                                        <span
                                                            key={`${group.siteId}:${index}`}
                                                            className="dashboard-workspace-widget__camera-site-button-meta-item"
                                                        >
                                                            {item}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </aside>

                    <div className="dashboard-workspace-widget__camera-site-detail">
                        {selectedGroup ? (
                            <>
                                <div className="dashboard-workspace-widget__camera-site-detail-header">
                                    <div className="dashboard-workspace-widget__camera-site-detail-copy">
                                        <Heading level={3} size="md">
                                            <Link
                                                to={buildSiteDetailsHref(selectedGroup.siteId)}
                                                className="dashboard-workspace-widget__title-link"
                                                onClick={(event) => {
                                                    handleSiteTitleClick(event, selectedGroup.siteId);
                                                }}
                                            >
                                                {selectedGroup.name}
                                            </Link>
                                        </Heading>

                                        {selectedGroup.subtitle ? (
                                            <Text
                                                variant="muted"
                                                className="dashboard-workspace-widget__entity-subtitle"
                                            >
                                                {selectedGroup.subtitle}
                                            </Text>
                                        ) : null}
                                    </div>

                                    {selectedGroup.displayedCamerasLabel ? (
                                        <Text
                                            variant="muted"
                                            className="dashboard-workspace-widget__camera-site-detail-count"
                                        >
                                            {selectedGroup.displayedCamerasLabel}
                                        </Text>
                                    ) : null}
                                </div>

                                <div className="dashboard-workspace-widget__camera-site-detail-summary">
                                    <div className="dashboard-workspace-widget__camera-site-stat">
                                        <span className="dashboard-workspace-widget__camera-site-stat-label">
                                            {onlineLabel}
                                        </span>
                                        <span className="dashboard-workspace-widget__camera-site-stat-value">
                                            {selectedGroup.onlineValue}
                                        </span>
                                    </div>

                                    <div className="dashboard-workspace-widget__camera-site-stat">
                                        <span className="dashboard-workspace-widget__camera-site-stat-label">
                                            {attentionLabel}
                                        </span>
                                        <span className="dashboard-workspace-widget__camera-site-stat-value">
                                            {selectedGroup.attentionValue}
                                        </span>
                                    </div>

                                    <div className="dashboard-workspace-widget__camera-site-stat">
                                        <span className="dashboard-workspace-widget__camera-site-stat-label">
                                            {incidentsLabel}
                                        </span>
                                        <span className="dashboard-workspace-widget__camera-site-stat-value">
                                            {selectedGroup.incidentsValue}
                                        </span>
                                    </div>
                                </div>

                                <div className="dashboard-workspace-widget__camera-detail-list">
                                    {selectedGroup.cameras.map((camera) => {
                                        const cameraMetaItems = buildCameraMetaItems(camera);

                                        return (
                                            <article
                                                key={camera.cameraId}
                                                className={`dashboard-workspace-widget__camera-detail-card dashboard-workspace-widget__camera-detail-card--${camera.tone}`}
                                            >
                                                <div className="dashboard-workspace-widget__camera-detail-top">
                                                    <div className="dashboard-workspace-widget__camera-detail-copy">
                                                        <Heading level={4} size="sm">
                                                            {camera.name}
                                                        </Heading>

                                                        <Text
                                                            variant="muted"
                                                            className="dashboard-workspace-widget__camera-detail-reason"
                                                        >
                                                            {camera.reasonLabel}
                                                        </Text>
                                                    </div>

                                                    <span className={`ui-pill ui-pill--${camera.tone}`}>
                                                        {camera.stateLabel}
                                                    </span>
                                                </div>

                                                {cameraMetaItems.length > 0 ? (
                                                    <div className="dashboard-workspace-widget__camera-detail-meta">
                                                        {cameraMetaItems.map((item, index) => (
                                                            <span
                                                                key={`${camera.cameraId}:${index}`}
                                                                className="dashboard-workspace-widget__camera-detail-meta-item"
                                                            >
                                                                {item}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </article>
                                        );
                                    })}
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            )}
        </Card>
    );
}