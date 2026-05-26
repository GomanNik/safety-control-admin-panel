// =====================
// src/widgets/overview/DashboardWorkspaceWidget/ui/DashboardKpiSection.tsx
// =====================

import type { JSX } from 'react';

import {
    Card,
    Grid,
    Heading,
    Text,
} from '../../../../shared/ui';

import type { DashboardKpiSectionViewModel } from '../types';

export interface DashboardKpiSectionProps {
    section: DashboardKpiSectionViewModel;
}

export function DashboardKpiSection(
    props: DashboardKpiSectionProps,
): JSX.Element {
    const { section } = props;

    return (
        <Card
            variant="elevated"
            padding="md"
            className="ui-workspace__section-card"
            header={(
                <div className="ui-workspace__section-header">
                    <Heading level={2} size="md">
                        {section.title}
                    </Heading>

                    {section.subtitle ? (
                        <Text
                            variant="muted"
                            className="ui-workspace__section-subtitle"
                        >
                            {section.subtitle}
                        </Text>
                    ) : null}
                </div>
            )}
        >
            <Grid
                columns="auto-fit"
                minColumnWidth={260}
                gap={12}
            >
                {section.items.map((item) => {
                    const metaItems = item.meta
                        .split('·')
                        .map((value) => value.trim())
                        .filter(Boolean);

                    return (
                        <article
                            key={item.key}
                            className={`ui-kpi-card ui-kpi-card--${item.tone}`}
                        >
                            <div className="ui-kpi-card__main">
                                <Text
                                    variant="muted"
                                    className="ui-kpi-card__title"
                                >
                                    {item.title}
                                </Text>

                                <div className="ui-kpi-card__value">
                                    {item.value}
                                </div>
                            </div>

                            <div className="ui-kpi-card__meta-list">
                                {metaItems.map((metaItem, index) => (
                                    <div
                                        key={`${item.key}:${index}`}
                                        className={`ui-kpi-card__meta-item ui-kpi-card__meta-item--${item.tone}`}
                                    >
                                        {metaItem}
                                    </div>
                                ))}
                            </div>
                        </article>
                    );
                })}
            </Grid>
        </Card>
    );
}