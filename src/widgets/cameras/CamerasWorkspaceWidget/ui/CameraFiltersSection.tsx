// =====================
// File: src/widgets/cameras/CamerasWorkspaceWidget/ui/CameraFiltersSection.tsx
// Purpose:
//   Фильтры workspace камер под новый контракт:
//   - search
//   - site
//   - statuses
//   Без presets / isActive / healthStatuses.
// =====================

import type { ChangeEvent, FormEvent, JSX } from 'react';

import { useI18nContext } from '../../../../shared/i18n';
import {
    Button,
    Card,
    Heading,
    Stack,
    Text,
} from '../../../../shared/ui';

import type {
    CamerasWorkspaceFilterFormValues,
    CamerasWorkspaceOption,
    CamerasWorkspaceSiteOption,
} from '../types';
import type { CameraStatus } from '../../../../entities/camera';
import styles from './CamerasWorkspaceWidget.module.css';

interface CameraFiltersSectionProps {
    title: string;
    subtitle?: string;
    values: CamerasWorkspaceFilterFormValues;
    siteOptions: CamerasWorkspaceSiteOption[];
    siteSearchLoading: boolean;
    statusOptions: CamerasWorkspaceOption<CameraStatus>[];
    setSiteQuery(value: string): void;
    selectSite(option: CamerasWorkspaceSiteOption): void;
    clearSiteSelection(): void;
    setSearch(value: string): void;
    toggleStatus(value: CameraStatus): void;
    apply(): void;
    reset(): void;
    restore(): void;
}

const getChoiceChipClassName = (
    baseClassName: string,
    activeClassName: string,
    active: boolean,
): string => {
    return active
        ? `${baseClassName} ${activeClassName}`
        : baseClassName;
};

export function CameraFiltersSection(
    props: CameraFiltersSectionProps,
): JSX.Element {
    const {
        title,
        subtitle,
        values,
        siteOptions,
        siteSearchLoading,
        statusOptions,
        setSiteQuery,
        selectSite,
        clearSiteSelection,
        setSearch,
        toggleStatus,
        apply,
        reset,
        restore,
    } = props;

    const { t } = useI18nContext();

    const onInput =
        (setter: (value: string) => void) =>
            (event: ChangeEvent<HTMLInputElement>) => {
                setter(event.target.value);
            };

    const onSubmit = (
        event: FormEvent<HTMLFormElement>,
    ): void => {
        event.preventDefault();
        apply();
    };

    const shouldShowSiteOptions =
        values.siteQuery.trim().length > 0 &&
        values.selectedSiteId === '';

    return (
        <Card
            variant="default"
            padding="md"
            header={(
                <div className={styles.sectionHeader}>
                    <Heading level={3}>
                        {title}
                    </Heading>

                    {subtitle ? (
                        <Text variant="muted">
                            {subtitle}
                        </Text>
                    ) : null}
                </div>
            )}
        >
            <form onSubmit={onSubmit}>
                <Stack gap={16}>
                    <div className={styles.formGridSingle}>
                        <label className={styles.field}>
                            <Text variant="caption">
                                {t('camera.workspace.filters.fields.search')}
                            </Text>

                            <input
                                className={styles.control}
                                type="search"
                                value={values.search}
                                placeholder={t('camera.workspace.filters.searchPlaceholder')}
                                onChange={onInput(setSearch)}
                            />
                        </label>

                        <label className={styles.field}>
                            <Text variant="caption">
                                {t('camera.workspace.filters.fields.siteId')}
                            </Text>

                            <input
                                className={styles.control}
                                type="search"
                                value={values.siteQuery}
                                placeholder={t('camera.workspace.filters.siteSearch.placeholder')}
                                onChange={onInput(setSiteQuery)}
                            />

                            {values.selectedSiteId ? (
                                <Text variant="muted">
                                    {t('camera.workspace.filters.siteSearch.selected', {
                                        site: values.siteQuery,
                                    })}
                                </Text>
                            ) : null}

                            {siteSearchLoading && shouldShowSiteOptions ? (
                                <div className={styles.emptyState}>
                                    <Text variant="muted">
                                        {t('camera.workspace.filters.siteSearch.loading')}
                                    </Text>
                                </div>
                            ) : null}

                            {!siteSearchLoading && shouldShowSiteOptions ? (
                                siteOptions.length > 0 ? (
                                    <label className={styles.field}>
                                        <Text variant="caption">
                                            {t('camera.workspace.filters.siteSearch.optionsLabel')}
                                        </Text>

                                        <select
                                            key={values.siteQuery}
                                            className={styles.control}
                                            defaultValue=""
                                            onChange={(event) => {
                                                const nextId = event.target.value;
                                                const option = siteOptions.find(
                                                    (item) => item.id === nextId,
                                                );

                                                if (!option) {
                                                    return;
                                                }

                                                selectSite(option);
                                            }}
                                        >
                                            <option value="" disabled>
                                                {t('camera.workspace.filters.siteSearch.optionsPlaceholder')}
                                            </option>

                                            {siteOptions.map((option) => (
                                                <option
                                                    key={option.id}
                                                    value={option.id}
                                                >
                                                    {option.subtitle
                                                        ? `${option.label} · ${option.subtitle}`
                                                        : option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <div className={styles.emptyState}>
                                        <Text variant="muted">
                                            {t('camera.workspace.filters.siteSearch.empty')}
                                        </Text>
                                    </div>
                                )
                            ) : null}

                            {(values.siteQuery.trim().length > 0 || values.selectedSiteId) ? (
                                <div className={styles.actionRow}>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={clearSiteSelection}
                                    >
                                        {t('camera.workspace.filters.siteSearch.clear')}
                                    </Button>
                                </div>
                            ) : null}
                        </label>
                    </div>

                    <div className={styles.choiceBlock}>
                        <Text variant="caption">
                            {t('camera.workspace.filters.fields.statuses')}
                        </Text>

                        <div className={styles.choiceGroup}>
                            {statusOptions.map((option) => {
                                const active = values.statuses.includes(option.value);

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={active}
                                        className={getChoiceChipClassName(
                                            styles.choiceChip,
                                            styles.choiceChipActive,
                                            active,
                                        )}
                                        onClick={() => {
                                            toggleStatus(option.value);
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.actionRow}>
                        <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                        >
                            {t('camera.workspace.actions.applyFilters')}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={reset}
                        >
                            {t('camera.workspace.actions.resetFilters')}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={restore}
                        >
                            {t('camera.workspace.actions.restoreFilters')}
                        </Button>
                    </div>
                </Stack>
            </form>
        </Card>
    );
}