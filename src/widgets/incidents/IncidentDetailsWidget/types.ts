// =====================
// src/widgets/incidents/IncidentDetailsWidget/types.ts
// =====================

import type { HTMLAttributes } from 'react';

import type {
    IncidentDetailsIncidentId,
    IncidentDetailsIncidentView,
    IncidentDetailsQueryView,
} from '../../../features/incident';
import type { Incident } from '../../../entities/incident';

export interface IncidentDetailsWidgetProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    incidentId?: IncidentDetailsIncidentId | null;
    showBackButton?: boolean;
    onBack?: () => void;
}

export interface IncidentDetailsWidgetSummaryItem {
    label: string;
    value: string;
}

export interface IncidentDetailsWidgetMetaItem {
    label: string;
    value: string;
}

export interface IncidentDetailsWidgetMediaLink {
    key: string;
    label: string;
    url: string;
}

export interface IncidentDetailsWidgetViewModel {
    incident?: Incident;
    details: IncidentDetailsIncidentView;
    query: IncidentDetailsQueryView;

    title: string;
    subtitle?: string;

    isIdle: boolean;
    isLoading: boolean;
    isError: boolean;
    isEmpty: boolean;

    emptyTitle: string;
    emptySubtitle: string;
    errorTitle: string;
    errorSubtitle: string;

    summaryItems: IncidentDetailsWidgetSummaryItem[];
    metaItems: IncidentDetailsWidgetMetaItem[];

    tagValues: string[];
    correlationValues: string[];

    mediaLinks: IncidentDetailsWidgetMediaLink[];
}