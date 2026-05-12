// =====================
// src/widgets/incidents/IncidentDetailsWidget/model/useIncidentDetailsWidget.ts
// =====================

import { useMemo } from 'react';

import { formatIncidentDateTime } from '../../../../entities/incident';
import type { TFunction } from '../../../../shared/i18n';
import { useI18nContext } from '../../../../shared/i18n';
import { getGlobalLogger } from '../../../../shared/logging';
import {
    useIncidentDetailsQuery,
    useIncidentDetailsQueryById,
} from '../../../../features/incident';

import type {
    IncidentDetailsWidgetMediaLink,
    IncidentDetailsWidgetMetaItem,
    IncidentDetailsWidgetSummaryItem,
    IncidentDetailsWidgetViewModel,
} from '../types';

interface UseIncidentDetailsWidgetOptions {
    incidentId?: string | null;
}

const logger = getGlobalLogger()
    .child('widgets')
    .child('incidents')
    .child('incident-details-widget');

const normalizeLookupToken = (
    value: unknown,
): string => {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s.-]+/g, '_');
};

const isUnknownLikeToken = (
    token: string,
): boolean => {
    return [
        'unknown',
        'unknown_value',
        'n_a',
        'na',
        'none',
        'null',
        'undefined',
    ].includes(token);
};

function pushMetaItem(
    target: IncidentDetailsWidgetMetaItem[],
    label: string,
    value: unknown,
): void {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
        return;
    }

    target.push({
        label,
        value: normalized,
    });
}

function normalizeDisplayValue(
    value: unknown,
    t: TFunction,
): string {
    const raw = String(value ?? '').trim();

    if (!raw) {
        return '';
    }

    const token = normalizeLookupToken(raw);

    if (isUnknownLikeToken(token)) {
        return t('common.unknown');
    }

    return raw;
}

function buildSummaryItems(
    incident: IncidentDetailsWidgetViewModel['incident'],
    details: IncidentDetailsWidgetViewModel['details'],
    t: TFunction,
    locale: string,
): IncidentDetailsWidgetSummaryItem[] {
    if (!incident) {
        return [];
    }

    const items: IncidentDetailsWidgetSummaryItem[] = [];

    const severityLabel = normalizeDisplayValue(details.severityLabel, t);
    const typeLabel = normalizeDisplayValue(details.typeLabel, t);
    const dataQualityStatusLabel = normalizeDisplayValue(details.dataQualityStatusLabel, t);

    if (typeLabel) {
        items.push({
            label: t('incident.details.summary.type'),
            value: typeLabel,
        });
    }

    if (severityLabel) {
        items.push({
            label: t('incident.details.summary.severity'),
            value: severityLabel,
        });
    }

    items.push({
        label: t('incident.details.summary.confidence'),
        value: typeof incident.confidence === 'number'
            ? incident.confidence.toLocaleString(locale, {
                maximumFractionDigits: 2,
            })
            : t('common.notAvailable'),
    });

    if (dataQualityStatusLabel) {
        items.push({
            label: t('incident.details.summary.dataQuality'),
            value: dataQualityStatusLabel,
        });
    }

    return items;
}

function buildMetaItems(
    incident: IncidentDetailsWidgetViewModel['incident'],
    details: IncidentDetailsWidgetViewModel['details'],
    t: TFunction,
    locale: string,
): IncidentDetailsWidgetMetaItem[] {
    if (!incident) {
        return [];
    }

    const items: IncidentDetailsWidgetMetaItem[] = [];

    pushMetaItem(items, t('incident.details.meta.id'), incident.id);
    pushMetaItem(items, t('incident.details.meta.eventId'), incident.eventId);
    pushMetaItem(items, t('incident.details.meta.site'), details.siteName);
    pushMetaItem(items, t('incident.details.meta.camera'), details.cameraName);
    pushMetaItem(items, t('incident.details.meta.eventTime'), details.eventTimeLabel);

    pushMetaItem(
        items,
        t('incident.details.meta.createdAt'),
        formatIncidentDateTime(incident.createdAt, {
            t,
            locale,
        }),
    );

    pushMetaItem(
        items,
        t('incident.details.meta.updatedAt'),
        formatIncidentDateTime(incident.updatedAt, {
            t,
            locale,
        }),
    );

    pushMetaItem(
        items,
        t('incident.details.meta.confidence'),
        typeof incident.confidence === 'number'
            ? incident.confidence.toLocaleString(locale, {
                maximumFractionDigits: 2,
            })
            : t('common.notAvailable'),
    );

    pushMetaItem(
        items,
        t('incident.details.meta.dataQuality'),
        normalizeDisplayValue(details.dataQualityStatusLabel, t),
    );

    return items;
}

function buildMediaLinks(
    details: IncidentDetailsWidgetViewModel['details'],
    t: TFunction,
): IncidentDetailsWidgetMediaLink[] {
    const links: IncidentDetailsWidgetMediaLink[] = [];

    if (details.imageUrl) {
        links.push({
            key: 'incident-image',
            label: t('incident.details.media.image'),
            url: details.imageUrl,
        });
    }

    if (details.clipUrl) {
        links.push({
            key: 'incident-video-fragment',
            label: t('incident.details.media.video'),
            url: details.clipUrl,
        });
    }

    return links;
}

function buildHeaderSubtitle(
    details: IncidentDetailsWidgetViewModel['details'],
): string | undefined {
    return details.displayTitle;
}

export function useIncidentDetailsWidget(
    options?: UseIncidentDetailsWidgetOptions,
): IncidentDetailsWidgetViewModel {
    const { t, locale } = useI18nContext();

    const explicitDetails = useIncidentDetailsQueryById(
        options?.incidentId ?? null,
        {
            enabled: Boolean(options?.incidentId),
        },
    );

    const storeDetails = useIncidentDetailsQuery({
        enabled: !options?.incidentId,
    });

    const source = options?.incidentId
        ? explicitDetails
        : storeDetails;

    return useMemo<IncidentDetailsWidgetViewModel>(() => {
        const details = source.incident;
        const incident = details.incident;
        const query = source.query;

        const isIdle = query.isIdle;
        const isLoading = query.isLoading || query.isFetching;
        const isError = query.isError;
        const isEmpty = !isIdle && !isLoading && !isError && !incident;

        const summaryItems = buildSummaryItems(incident, details, t, locale);
        const metaItems = buildMetaItems(incident, details, t, locale);
        const mediaLinks = buildMediaLinks(details, t);
        logger.info('incident details widget snapshot', {
            locale,
            incidentId: incident?.id ?? null,
            detailsDisplayTitle: details.displayTitle,
            detailsDisplaySubtitle: details.displaySubtitle,
            detailsSeverityLabel: details.severityLabel,
            detailsTypeLabel: details.typeLabel,
            detailsDataQualityStatusLabel: details.dataQualityStatusLabel,
            metaCount: metaItems.length,
            mediaCount: mediaLinks.length,
        });

        return {
            incident,
            details,
            query,

            title: t('incident.details.title'),
            subtitle: buildHeaderSubtitle(details),

            isIdle,
            isLoading,
            isError,
            isEmpty,

            emptyTitle: t('incident.details.empty.title'),
            emptySubtitle: t('incident.details.empty.subtitle'),
            errorTitle: t('incident.details.error.title'),
            errorSubtitle: t('incident.details.error.subtitle'),

            summaryItems,
            metaItems,

            tagValues: details.tags,
            correlationValues: details.correlationIds,

            mediaLinks,
        };
    }, [
        locale,
        source,
        t,
    ]);
}