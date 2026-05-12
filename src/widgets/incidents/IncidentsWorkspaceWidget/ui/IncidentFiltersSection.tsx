// =====================
// src/widgets/incidents/IncidentsWorkspaceWidget/ui/IncidentFiltersSection.tsx
// =====================

import { useMemo } from 'react';
import type { JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import {
    Button,
    Card,
    FormField,
    Heading,
    Input,
    Stack,
    Text,
} from '../../../../shared/ui';

import type {
    IncidentWidgetOption,
    IncidentsWorkspaceFiltersSectionView,
} from '../types';

interface IncidentFiltersSectionProps {
    title: string;
    subtitle?: string;
    view: IncidentsWorkspaceFiltersSectionView;
}

interface MultiChoiceFieldProps {
    label: string;
    emptyText: string;
    options: IncidentWidgetOption[];
    selectedValues: string[];
    onChange(values: string[]): void;
}

function toggleValue(
    values: string[],
    nextValue: string,
): string[] {
    if (values.includes(nextValue)) {
        return values.filter((value) => value !== nextValue);
    }

    return [...values, nextValue];
}

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

function MultiChoiceField(
    props: MultiChoiceFieldProps,
): JSX.Element {
    const {
        label,
        emptyText,
        options,
        selectedValues,
        onChange,
    } = props;

    const hasOptions = options.length > 0;

    return (
        <FormField label={label}>
            <div className="incidents-filters__choice-panel">
                {!hasOptions ? (
                    <Text variant="muted">
                        {emptyText}
                    </Text>
                ) : (
                    <div className="incidents-filters__choice-list">
                        {options.map((option) => {
                            const isSelected = selectedValues.includes(option.value);

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={[
                                        'incidents-filters__choice-button',
                                        isSelected
                                            ? 'incidents-filters__choice-button--selected'
                                            : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => {
                                        onChange(
                                            toggleValue(
                                                selectedValues,
                                                option.value,
                                            ),
                                        );
                                    }}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </FormField>
    );
}

export function IncidentFiltersSection(
    props: IncidentFiltersSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        view,
    } = props;

    const { t, locale } = useI18nContext();

    const isApplyDisabled = useMemo(() => {
        const hasFrom = Boolean(view.draft.from);
        const hasTo = Boolean(view.draft.to);

        if (hasFrom && !isCompleteDateInputValue(view.draft.from)) {
            return true;
        }

        if (hasTo && !isCompleteDateInputValue(view.draft.to)) {
            return true;
        }

        if (hasFrom && view.draft.from < view.minDateValue) {
            return true;
        }

        if (hasFrom && view.draft.from > view.maxDateValue) {
            return true;
        }

        if (hasTo && view.draft.to < view.minDateValue) {
            return true;
        }

        if (hasTo && view.draft.to > view.maxDateValue) {
            return true;
        }

        return hasFrom && hasTo && view.draft.from > view.draft.to;
    }, [
        view.draft.from,
        view.draft.to,
        view.maxDateValue,
        view.minDateValue,
    ]);

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
            <div className="incidents-filters">
                <div className="incidents-filters__group">
                    <div className="incidents-filters__primary-grid">
                        <FormField
                            label={t('incidents.workspace.filters.fields.search.label')}
                            helpText={t('incidents.workspace.filters.fields.search.help')}
                        >
                            <Input
                                value={view.draft.search}
                                onChange={(event) => {
                                    view.onSearchChange(event.currentTarget.value);
                                }}
                                placeholder={t('incidents.workspace.filters.fields.search.placeholder')}
                            />
                        </FormField>

                        <div
                            className="incidents-filters__period-block"
                            lang={locale}
                        >
                            <FormField
                                label={t('incidents.workspace.filters.fields.from.label')}
                                helpText={t('incidents.workspace.filters.fields.from.help')}
                            >
                                <Input
                                    key={`incident-filters-from-${locale}`}
                                    lang={locale}
                                    type="date"
                                    min={view.minDateValue}
                                    max={view.maxDateValue}
                                    value={view.draft.from}
                                    onChange={(event) => {
                                        view.onFromChange(event.currentTarget.value);
                                    }}
                                    onBlur={(event) => {
                                        view.onFromChange(
                                            clampDateDraftValue(
                                                event.currentTarget.value,
                                                view.minDateValue,
                                                view.maxDateValue,
                                            ),
                                        );
                                    }}
                                />
                            </FormField>

                            <FormField
                                label={t('incidents.workspace.filters.fields.to.label')}
                                helpText={t('incidents.workspace.filters.fields.to.help')}
                            >
                                <Input
                                    key={`incident-filters-to-${locale}`}
                                    lang={locale}
                                    type="date"
                                    min={view.minDateValue}
                                    max={view.maxDateValue}
                                    value={view.draft.to}
                                    onChange={(event) => {
                                        view.onToChange(event.currentTarget.value);
                                    }}
                                    onBlur={(event) => {
                                        view.onToChange(
                                            clampDateDraftValue(
                                                event.currentTarget.value,
                                                view.minDateValue,
                                                view.maxDateValue,
                                            ),
                                        );
                                    }}
                                />
                            </FormField>
                        </div>
                    </div>
                </div>

                <div className="incidents-filters__group">
                    <div className="incidents-filters__secondary-grid">
                        <FormField
                            label={t('incidents.workspace.filters.fields.siteIds.label')}
                            helpText={t('incidents.workspace.filters.fields.siteIds.help')}
                        >
                            <Input
                                value={view.draft.siteIdsText}
                                onChange={(event) => {
                                    view.onSiteIdsTextChange(event.currentTarget.value);
                                }}
                                placeholder={t('incidents.workspace.filters.fields.siteIds.placeholder')}
                            />
                        </FormField>

                        <FormField
                            label={t('incidents.workspace.filters.fields.cameraIds.label')}
                            helpText={t('incidents.workspace.filters.fields.cameraIds.help')}
                        >
                            <Input
                                value={view.draft.cameraIdsText}
                                onChange={(event) => {
                                    view.onCameraIdsTextChange(event.currentTarget.value);
                                }}
                                placeholder={t('incidents.workspace.filters.fields.cameraIds.placeholder')}
                            />
                        </FormField>

                        <FormField
                            label={t('incidents.workspace.filters.fields.tags.label')}
                            helpText={t('incidents.workspace.filters.fields.tags.help')}
                        >
                            <Input
                                value={view.draft.tagsText}
                                onChange={(event) => {
                                    view.onTagsTextChange(event.currentTarget.value);
                                }}
                                placeholder={t('incidents.workspace.filters.fields.tags.placeholder')}
                            />
                        </FormField>

                        <FormField
                            label={t('incidents.workspace.filters.fields.minConfidence.label')}
                        >
                            <Input
                                type="number"
                                value={view.draft.minConfidence}
                                onChange={(event) => {
                                    view.onMinConfidenceChange(event.currentTarget.value);
                                }}
                                placeholder="0"
                            />
                        </FormField>

                        <FormField
                            label={t('incidents.workspace.filters.fields.maxConfidence.label')}
                        >
                            <Input
                                type="number"
                                value={view.draft.maxConfidence}
                                onChange={(event) => {
                                    view.onMaxConfidenceChange(event.currentTarget.value);
                                }}
                                placeholder="1"
                            />
                        </FormField>
                    </div>
                </div>

                <div className="incidents-filters__group">
                    <div className="incidents-filters__categories-grid">
                        <MultiChoiceField
                            label={t('incidents.workspace.filters.fields.severities.label')}
                            emptyText={t('incidents.workspace.filters.fields.severities.empty')}
                            options={view.severityOptions}
                            selectedValues={view.draft.severities}
                            onChange={view.onSeveritiesChange}
                        />

                        <MultiChoiceField
                            label={t('incidents.workspace.filters.fields.types.label')}
                            emptyText={t('incidents.workspace.filters.fields.types.empty')}
                            options={view.typeOptions}
                            selectedValues={view.draft.types}
                            onChange={view.onTypesChange}
                        />
                    </div>
                </div>

                <div className="incidents-filters__footer">
                    <div className="incidents-filters__actions">
                        <Button
                            variant="primary"
                            onClick={view.onApply}
                            disabled={isApplyDisabled}
                        >
                            {t('incidents.workspace.filters.actions.apply')}
                        </Button>

                        <Button
                            variant="outline"
                            onClick={view.onReset}
                        >
                            {t('incidents.workspace.filters.actions.reset')}
                        </Button>
                    </div>

                    <div className="incidents-filters__page-size">
                        <FormField
                            label={t('incidents.workspace.filters.fields.pageSize.label')}
                            helpText={t('incidents.workspace.filters.fields.pageSize.help', {
                                min: view.pageSizeMin,
                                max: view.pageSizeMax,
                            })}
                        >
                            <Input
                                type="number"
                                min={view.pageSizeMin}
                                max={view.pageSizeMax}
                                step={1}
                                value={String(view.draft.pageSize)}
                                onChange={(event) => {
                                    view.onPageSizeChange(Number(event.currentTarget.value));
                                }}
                            />
                        </FormField>
                    </div>
                </div>
            </div>
        </Card>
    );
}