// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/ui/DashboardSitesHealthSection.tsx
// =====================

import {
    useMemo,
    useState,
    type MouseEvent,
    type JSX,
} from 'react';
import { Link } from 'react-router-dom';

import {
    Card,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';
import { useTranslation } from '../../../../shared/i18n';
import { DashboardSectionHelpPopover } from '../../dashboard-section-help';

import type { DashboardSitesHealthSectionViewModel } from '../types';

export interface DashboardSitesHealthSectionProps {
    section: DashboardSitesHealthSectionViewModel;
    onOpenSiteDetails?: (siteId: string) => void;
}

const DEFAULT_VISIBLE_ITEMS_COUNT = 2;

function buildSiteDetailsHref(
    siteId: string,
): string {
    return `/sites/${encodeURIComponent(siteId)}`;
}

export function DashboardSitesHealthSection(
    props: DashboardSitesHealthSectionProps,
): JSX.Element {
    const {
        section,
        onOpenSiteDetails,
    } = props;
    const { t } = useTranslation();

    const [isExpanded, setIsExpanded] = useState(false);

    const hasOverflow = section.items.length > DEFAULT_VISIBLE_ITEMS_COUNT;

    const visibleItems = useMemo(() => {
        if (isExpanded || !hasOverflow) {
            return section.items;
        }

        return section.items.slice(0, DEFAULT_VISIBLE_ITEMS_COUNT);
    }, [
        hasOverflow,
        isExpanded,
        section.items,
    ]);

    const hiddenCount = Math.max(
        0,
        section.items.length - DEFAULT_VISIBLE_ITEMS_COUNT,
    );

    const expandLabel = `${t('common.expandMore')} ${hiddenCount}`;

    const handleSiteTitleClick = (
        event: MouseEvent<HTMLAnchorElement>,
        siteId: string,
    ): void => {
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

                            <DashboardSectionHelpPopover help={section.help} />
                        </div>
                    </div>
                </div>
            )}
        >
            {section.items.length === 0 ? (
                <Text
                    variant="muted"
                    className="ui-workspace__empty-inline"
                >
                    {section.emptyLabel}
                </Text>
            ) : (
                <>
                    <Stack gap={12}>
                        {visibleItems.map((item) => (
                            <article
                                key={item.siteId}
                                className={`ui-entity-card ui-entity-card--${item.tone}`}
                            >
                                <div className="ui-entity-card__header">
                                    <div className="ui-entity-card__header-copy">
                                        <Heading level={3} size="sm">
                                            <Link
                                                to={buildSiteDetailsHref(item.siteId)}
                                                className="dashboard-workspace-widget__title-link"
                                                onClick={(event) => {
                                                    handleSiteTitleClick(event, item.siteId);
                                                }}
                                            >
                                                {item.name}
                                            </Link>
                                        </Heading>

                                        {item.subtitle ? (
                                            <Text
                                                variant="muted"
                                                className="dashboard-workspace-widget__entity-subtitle"
                                            >
                                                {item.subtitle}
                                            </Text>
                                        ) : null}
                                    </div>

                                    <div className="ui-pills">
                                        <span className={`ui-pill ui-pill--${item.statusTone}`}>
                                            {item.statusLabel}
                                        </span>

                                        <span className={`ui-pill ui-pill--${item.healthTone}`}>
                                            {item.healthLabel}
                                        </span>
                                    </div>
                                </div>

                                <div className="ui-metrics-row">
                                    <span className="ui-metric-chip">
                                        {item.camerasLabel}
                                    </span>
                                    <span className="ui-metric-chip">
                                        {item.attentionLabel}
                                    </span>
                                    <span className="ui-metric-chip">
                                        {item.incidentsLabel}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </Stack>

                    {hasOverflow ? (
                        <div className="dashboard-workspace-widget__sites-toggle-wrap">
                            <button
                                type="button"
                                className="dashboard-workspace-widget__sites-toggle"
                                aria-expanded={isExpanded}
                                onClick={() => setIsExpanded((value) => !value)}
                            >
                                <span>
                                    {isExpanded
                                        ? t('common.collapse')
                                        : expandLabel}
                                </span>

                                <span
                                    className={`dashboard-workspace-widget__sites-toggle-icon${
                                        isExpanded
                                            ? ' dashboard-workspace-widget__sites-toggle-icon--expanded'
                                            : ''
                                    }`}
                                    aria-hidden="true"
                                >
                                    ▼
                                </span>
                            </button>
                        </div>
                    ) : null}
                </>
            )}
        </Card>
    );
}