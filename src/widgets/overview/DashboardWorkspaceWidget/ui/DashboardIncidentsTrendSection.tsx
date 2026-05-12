// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/ui/DashboardIncidentsTrendSection.tsx
// Purpose:
// - Renders incidents trend section for overview dashboard
// - Keeps only period controls and SVG chart inside the section
// - Draws both axis titles inside SVG to avoid broken vertical HTML labels
// - Uses inline date range inputs inspired by incidents workspace filters
// =====================

import {
    useEffect,
    useMemo,
    useState,
} from 'react';
import type { JSX } from 'react';

import {
    Card,
    Heading,
    Text,
} from '../../../../shared/ui';
import { useTranslation } from '../../../../shared/i18n';

import type {
    DashboardIncidentsTrendSectionViewModel,
    DashboardTrendPointViewModel,
} from '../types';

export interface DashboardIncidentsTrendSectionProps {
    section: DashboardIncidentsTrendSectionViewModel;
}

const CHART_VIEWBOX_WIDTH = 960;
const CHART_VIEWBOX_HEIGHT = 420;

const CHART_MARGIN = {
    top: 24,
    right: 24,
    bottom: 72,
    left: 88,
};

function isCompleteDateInputValue(
    value: string,
): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clampDateDraftValue(
    value: string,
    minValue: string,
    maxValue: string,
): string {
    if (!isCompleteDateInputValue(value)) {
        return value;
    }

    if (value < minValue) {
        return minValue;
    }

    if (value > maxValue) {
        return maxValue;
    }

    return value;
}

function toDayStamp(
    value: string,
): number | null {
    if (!isCompleteDateInputValue(value)) {
        return null;
    }

    const parsed = new Date(`${value}T00:00:00`);

    return Number.isNaN(parsed.getTime())
        ? null
        : parsed.getTime();
}

function getInclusiveDayDistance(
    from: string,
    to: string,
): number | null {
    const fromStamp = toDayStamp(from);
    const toStamp = toDayStamp(to);

    if (fromStamp == null || toStamp == null) {
        return null;
    }

    const diff = toStamp - fromStamp;

    if (diff < 0) {
        return null;
    }

    return Math.floor(diff / 86_400_000) + 1;
}

function buildTickIndices(
    pointCount: number,
    maxTicks: number,
): number[] {
    if (pointCount <= 0) {
        return [];
    }

    if (pointCount <= maxTicks) {
        return Array.from({ length: pointCount }, (_, index) => index);
    }

    const indices = new Set<number>();

    for (let step = 0; step < maxTicks; step += 1) {
        const ratio = maxTicks === 1
            ? 0
            : step / (maxTicks - 1);

        indices.add(
            Math.round((pointCount - 1) * ratio),
        );
    }

    return Array.from(indices).sort((left, right) => left - right);
}

function buildYTicks(
    maxValue: number,
): number[] {
    if (maxValue <= 4) {
        return Array.from({ length: maxValue + 1 }, (_, index) => index);
    }

    const step = Math.max(1, Math.ceil(maxValue / 4));
    const ticks: number[] = [];

    for (let value = 0; value <= step * 4; value += step) {
        ticks.push(value);
    }

    return ticks;
}

function createLinePath(
    points: Array<{ x: number; y: number }>,
): string {
    if (points.length === 0) {
        return '';
    }

    return points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');
}

function createAreaPath(
    points: Array<{ x: number; y: number }>,
    baselineY: number,
): string {
    if (points.length === 0) {
        return '';
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const linePath = createLinePath(points);

    return [
        `M ${firstPoint.x} ${baselineY}`,
        linePath,
        `L ${lastPoint.x} ${baselineY}`,
        'Z',
    ].join(' ');
}

function buildChartModel(
    sourcePoints: ReadonlyArray<DashboardTrendPointViewModel>,
): {
    width: number;
    height: number;
    plotLeft: number;
    plotTop: number;
    plotWidth: number;
    plotHeight: number;
    baselineY: number;
    yTicks: number[];
    xTickIndices: number[];
    xAxisTitleX: number;
    xAxisTitleY: number;
    yAxisTitleX: number;
    yAxisTitleY: number;
    points: Array<DashboardTrendPointViewModel & {
        x: number;
        y: number;
    }>;
    areaPath: string;
    linePath: string;
} {
    const width = CHART_VIEWBOX_WIDTH;
    const height = CHART_VIEWBOX_HEIGHT;

    const plotLeft = CHART_MARGIN.left;
    const plotTop = CHART_MARGIN.top;
    const plotWidth = width - CHART_MARGIN.left - CHART_MARGIN.right;
    const plotHeight = height - CHART_MARGIN.top - CHART_MARGIN.bottom;

    const rawMax = sourcePoints.reduce(
        (max, point) => Math.max(max, point.count),
        0,
    );

    const yTicks = buildYTicks(rawMax);
    const yMax = yTicks[yTicks.length - 1] || 1;
    const baselineY = plotTop + plotHeight;

    const points = sourcePoints.map((point, index) => {
        const x = sourcePoints.length <= 1
            ? plotLeft + plotWidth / 2
            : plotLeft + (plotWidth * index) / (sourcePoints.length - 1);

        const ratio = yMax <= 0
            ? 0
            : point.count / yMax;

        const y = baselineY - (plotHeight * ratio);

        return {
            ...point,
            x,
            y,
        };
    });

    return {
        width,
        height,
        plotLeft,
        plotTop,
        plotWidth,
        plotHeight,
        baselineY,
        yTicks,
        xTickIndices: buildTickIndices(sourcePoints.length, 6),
        xAxisTitleX: plotLeft + plotWidth / 2,
        xAxisTitleY: height - 18,
        yAxisTitleX: 28,
        yAxisTitleY: plotTop + plotHeight / 2,
        points,
        areaPath: createAreaPath(points, baselineY),
        linePath: createLinePath(points),
    };
}

export function DashboardIncidentsTrendSection(
    props: DashboardIncidentsTrendSectionProps,
): JSX.Element {
    const { section } = props;
    const { locale } = useTranslation();

    const [draftFrom, setDraftFrom] = useState(section.period.fromValue);
    const [draftTo, setDraftTo] = useState(section.period.toValue);

    useEffect(() => {
        setDraftFrom(section.period.fromValue);
        setDraftTo(section.period.toValue);
    }, [
        section.period.fromValue,
        section.period.toValue,
    ]);

    const isApplyDisabled = useMemo(() => {
        const hasFrom = Boolean(draftFrom);
        const hasTo = Boolean(draftTo);

        if (hasFrom && !isCompleteDateInputValue(draftFrom)) {
            return true;
        }

        if (hasTo && !isCompleteDateInputValue(draftTo)) {
            return true;
        }

        if (hasFrom && draftFrom < section.period.minDateValue) {
            return true;
        }

        if (hasFrom && draftFrom > section.period.maxDateValue) {
            return true;
        }

        if (hasTo && draftTo < section.period.minDateValue) {
            return true;
        }

        if (hasTo && draftTo > section.period.maxDateValue) {
            return true;
        }

        if (hasFrom && hasTo && draftFrom > draftTo) {
            return true;
        }

        const dayDistance = getInclusiveDayDistance(draftFrom, draftTo);

        return dayDistance != null
            && dayDistance > section.period.maxRangeDays;
    }, [
        draftFrom,
        draftTo,
        section.period.maxDateValue,
        section.period.maxRangeDays,
        section.period.minDateValue,
    ]);

    const chartModel = useMemo(
        () => buildChartModel(section.points),
        [section.points],
    );

    return (
        <Card
            variant="elevated"
            padding="md"
            className="ui-workspace__section-card"
            header={(
                <div className="ui-workspace__section-header">
                    <div className="dashboard-workspace-widget__incidents-head">
                        <div className="dashboard-workspace-widget__incidents-copy">
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

                        <div
                            className="dashboard-workspace-widget__period-toolbar"
                            lang={locale}
                        >
                            <div className="dashboard-workspace-widget__period-presets">
                                {section.period.presets.map((preset) => (
                                    <button
                                        key={preset.key}
                                        type="button"
                                        className={[
                                            'dashboard-workspace-widget__period-preset',
                                            preset.isActive
                                                ? 'dashboard-workspace-widget__period-preset--active'
                                                : '',
                                        ].filter(Boolean).join(' ')}
                                        onClick={() => {
                                            section.period.onPresetSelect(preset.key);
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>

                            <div className="dashboard-workspace-widget__period-range">
                                <div className="dashboard-workspace-widget__period-date-fields">
                                    <input
                                        type="date"
                                        lang={locale}
                                        min={section.period.minDateValue}
                                        max={section.period.maxDateValue}
                                        value={draftFrom}
                                        className="dashboard-workspace-widget__period-date-input"
                                        aria-label={section.period.fromLabel}
                                        onChange={(event) => {
                                            setDraftFrom(event.currentTarget.value);
                                        }}
                                        onBlur={(event) => {
                                            setDraftFrom(
                                                clampDateDraftValue(
                                                    event.currentTarget.value,
                                                    section.period.minDateValue,
                                                    section.period.maxDateValue,
                                                ),
                                            );
                                        }}
                                    />

                                    <span
                                        className="dashboard-workspace-widget__period-date-separator"
                                        aria-hidden="true"
                                    >
                                        —
                                    </span>

                                    <input
                                        type="date"
                                        lang={locale}
                                        min={section.period.minDateValue}
                                        max={section.period.maxDateValue}
                                        value={draftTo}
                                        className="dashboard-workspace-widget__period-date-input"
                                        aria-label={section.period.toLabel}
                                        onChange={(event) => {
                                            setDraftTo(event.currentTarget.value);
                                        }}
                                        onBlur={(event) => {
                                            setDraftTo(
                                                clampDateDraftValue(
                                                    event.currentTarget.value,
                                                    section.period.minDateValue,
                                                    section.period.maxDateValue,
                                                ),
                                            );
                                        }}
                                    />
                                </div>

                                <button
                                    type="button"
                                    className="dashboard-workspace-widget__period-apply"
                                    disabled={isApplyDisabled}
                                    onClick={() => {
                                        if (isApplyDisabled) {
                                            return;
                                        }

                                        section.period.onApply({
                                            from: draftFrom,
                                            to: draftTo,
                                        });
                                    }}
                                >
                                    {section.period.applyLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        >
            {section.points.length === 0 ? (
                <Text
                    variant="muted"
                    className="ui-workspace__empty-inline"
                >
                    {section.chartEmptyLabel}
                </Text>
            ) : (
                <div className="dashboard-workspace-widget__chart-card">
                    <div className="dashboard-workspace-widget__chart-shell">
                        <svg
                            viewBox={`0 0 ${chartModel.width} ${chartModel.height}`}
                            className="dashboard-workspace-widget__chart-svg"
                            role="img"
                            aria-label={section.title}
                            preserveAspectRatio="xMidYMid meet"
                        >
                            {chartModel.yTicks.map((tick) => {
                                const yMax = chartModel.yTicks[chartModel.yTicks.length - 1] || 1;
                                const tickRatio = yMax <= 0
                                    ? 0
                                    : tick / yMax;

                                const y = chartModel.baselineY - (chartModel.plotHeight * tickRatio);

                                return (
                                    <g key={`y:${tick}`}>
                                        <line
                                            x1={chartModel.plotLeft}
                                            x2={chartModel.plotLeft + chartModel.plotWidth}
                                            y1={y}
                                            y2={y}
                                            className="dashboard-workspace-widget__chart-grid-line"
                                        />
                                        <text
                                            x={chartModel.plotLeft - 12}
                                            y={y + 5}
                                            textAnchor="end"
                                            className="dashboard-workspace-widget__chart-axis-label"
                                        >
                                            {tick}
                                        </text>
                                    </g>
                                );
                            })}

                            {chartModel.xTickIndices.map((index) => {
                                const point = chartModel.points[index];

                                return (
                                    <g key={`x:${point.key}`}>
                                        <line
                                            x1={point.x}
                                            x2={point.x}
                                            y1={chartModel.plotTop}
                                            y2={chartModel.baselineY}
                                            className="dashboard-workspace-widget__chart-grid-line dashboard-workspace-widget__chart-grid-line--vertical"
                                        />
                                        <text
                                            x={point.x}
                                            y={chartModel.baselineY + 28}
                                            textAnchor="middle"
                                            className="dashboard-workspace-widget__chart-axis-label"
                                        >
                                            {point.label}
                                        </text>
                                    </g>
                                );
                            })}

                            <line
                                x1={chartModel.plotLeft}
                                x2={chartModel.plotLeft}
                                y1={chartModel.plotTop}
                                y2={chartModel.baselineY}
                                className="dashboard-workspace-widget__chart-axis-line"
                            />

                            <line
                                x1={chartModel.plotLeft}
                                x2={chartModel.plotLeft + chartModel.plotWidth}
                                y1={chartModel.baselineY}
                                y2={chartModel.baselineY}
                                className="dashboard-workspace-widget__chart-axis-line"
                            />

                            <path
                                d={chartModel.areaPath}
                                className="dashboard-workspace-widget__chart-area"
                            />

                            <path
                                d={chartModel.linePath}
                                className="dashboard-workspace-widget__chart-line"
                            />

                            {chartModel.points.map((point) => (
                                <circle
                                    key={point.key}
                                    cx={point.x}
                                    cy={point.y}
                                    r={6}
                                    className="dashboard-workspace-widget__chart-point"
                                >
                                    <title>{point.countLabel}</title>
                                </circle>
                            ))}

                            <text
                                x={chartModel.xAxisTitleX}
                                y={chartModel.xAxisTitleY}
                                textAnchor="middle"
                                className="dashboard-workspace-widget__chart-axis-title"
                            >
                                {section.chartAxisXLabel}
                            </text>

                            <text
                                x={chartModel.yAxisTitleX}
                                y={chartModel.yAxisTitleY}
                                textAnchor="middle"
                                className="dashboard-workspace-widget__chart-axis-title"
                                transform={`rotate(-90 ${chartModel.yAxisTitleX} ${chartModel.yAxisTitleY})`}
                            >
                                {section.chartAxisYLabel}
                            </text>
                        </svg>
                    </div>
                </div>
            )}
        </Card>
    );
}