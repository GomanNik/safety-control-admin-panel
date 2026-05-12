// =====================
// File: src/widgets/overview/DashboardWorkspaceWidget/model/useDashboardWorkspaceWidget.ts
// Purpose:
// - View-model for overview dashboard widget
// - Adapted to simplified camera contract:
//   status + statusReason + lastSeenAt
// - Owns incident report modal state at widget/page level
// - Keeps incidents trend section focused on chart + period only
// =====================

import {
    useCallback,
    useMemo,
    useState,
} from 'react';

import {
    formatCameraLastSeenAt,
    formatCameraStatus,
    formatCameraStatusReason,
} from '../../../../entities/camera';
import { useOverviewDashboard } from '../../../../features/common';
import { useTranslation } from '../../../../shared/i18n';

import {
    getDashboardCameraReasonCode,
    mapDashboardCameraReasonToTone,
    mapDashboardStateToTone,
} from '../hooks';
import type { DashboardCameraReasonCode } from '../hooks';
import type {
    DashboardDateRangePickerViewModel,
    DashboardIncidentReportActionViewModel,
    DashboardIncidentReportMediaMode,
    DashboardIncidentReportMediaOptionViewModel,
    DashboardIncidentReportModalViewModel,
    DashboardIncidentReportSiteOptionViewModel,
    DashboardIncidentReportSitesMode,
    DashboardIncidentsTrendSectionViewModel,
    DashboardKpiItemViewModel,
    DashboardSectionHelpViewModel,
    DashboardSiteHealthItemViewModel,
    DashboardTrendPointViewModel,
    DashboardWidgetTone,
    DashboardWorkspaceWidgetModel,
    DashboardWorkspaceWidgetProps,
} from '../types';

const MIN_INCIDENT_PERIOD_DATE = new Date(2020, 0, 1);

type TranslateFn = (
    key: string,
    params?: Record<string, unknown>,
) => string;

type ReportDraftState = {
    from: string;
    to: string;
    sitesMode: DashboardIncidentReportSitesMode;
    selectedSiteIds: string[];
    mediaMode: DashboardIncidentReportMediaMode;
    isSubmitting: boolean;
    submitErrorMessage?: string;
};

type DashboardIncidentReportSubmitPayload = {
    from: string;
    to: string;
    siteIds?: string[];
    sitesMode: DashboardIncidentReportSitesMode;
    mediaMode: DashboardIncidentReportMediaMode;
    scope?: unknown;
};

type DashboardWorkspaceWidgetPropsWithReportSubmit =
    DashboardWorkspaceWidgetProps & {
    onIncidentReportSubmit?: (
        payload: DashboardIncidentReportSubmitPayload,
    ) => void | Promise<void>;
};

const buildNumberFormatter = (
    locale: string,
): Intl.NumberFormat => {
    try {
        return new Intl.NumberFormat(locale);
    } catch {
        return new Intl.NumberFormat();
    }
};

const buildShortDateFormatter = (
    locale: string,
): Intl.DateTimeFormat => {
    try {
        return new Intl.DateTimeFormat(locale, {
            day: '2-digit',
            month: '2-digit',
        });
    } catch {
        return new Intl.DateTimeFormat(undefined, {
            day: '2-digit',
            month: '2-digit',
        });
    }
};

const buildLongDateFormatter = (
    locale: string,
): Intl.DateTimeFormat => {
    try {
        return new Intl.DateTimeFormat(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    } catch {
        return new Intl.DateTimeFormat(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }
};

const startOfDay = (
    value: Date,
): Date => {
    return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        0,
        0,
        0,
        0,
    );
};

const endOfDay = (
    value: Date,
): Date => {
    return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        23,
        59,
        59,
        999,
    );
};

const addDays = (
    value: Date,
    amount: number,
): Date => {
    const next = new Date(value);
    next.setDate(next.getDate() + amount);
    return next;
};

const createPresetRange = (
    days: number,
): { from: Date; to: Date } => {
    const today = new Date();

    return {
        from: startOfDay(addDays(today, -(days - 1))),
        to: endOfDay(today),
    };
};

const formatDateInputValue = (
    value: Date,
): string => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const parseDateInputValue = (
    value: string,
): Date | null => {
    if (!value) {
        return null;
    }

    const parsed = new Date(`${value}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
};

const isSameCalendarDay = (
    left: Date,
    right: Date,
): boolean => {
    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    );
};

const isSameRange = (
    left: { from: Date; to: Date },
    right: { from: Date; to: Date },
): boolean => {
    return (
        isSameCalendarDay(left.from, right.from) &&
        isSameCalendarDay(left.to, right.to)
    );
};

const getSitesKpiTone = (
    totalSites: number,
    problematicSites: number,
): DashboardWidgetTone => {
    if (totalSites <= 0 || problematicSites <= 0) {
        return 'success';
    }

    if (problematicSites >= totalSites) {
        return 'critical';
    }

    return 'warning';
};

const getCamerasKpiTone = (
    totalCameras: number,
    attentionCameras: number,
): DashboardWidgetTone => {
    if (totalCameras <= 0 || attentionCameras <= 0) {
        return 'success';
    }

    const share = attentionCameras / totalCameras;

    if (share >= 0.7) {
        return 'critical';
    }

    return 'warning';
};

const getIncidentsKpiTone = (
    recentTrendCount: number,
): DashboardWidgetTone => {
    if (recentTrendCount <= 0) {
        return 'success';
    }

    if (recentTrendCount >= 30) {
        return 'critical';
    }

    return 'warning';
};

const getSiteModeTone = (
    mode: 'active' | 'inactive',
): DashboardWidgetTone => {
    switch (mode) {
        case 'active':
            return 'success';
        case 'inactive':
        default:
            return 'info';
    }
};

const getSiteHealthTone = (
    health: 'normal' | 'warning' | 'critical',
): DashboardWidgetTone => {
    switch (health) {
        case 'normal':
            return 'success';
        case 'warning':
            return 'warning';
        case 'critical':
        default:
            return 'critical';
    }
};

const getSiteModeLabel = (
    mode: 'active' | 'inactive',
    t: TranslateFn,
): string => {
    switch (mode) {
        case 'active':
            return t('common.active', {
                defaultValue: 'Активна',
            });
        case 'inactive':
        default:
            return t('common.inactive', {
                defaultValue: 'Неактивна',
            });
    }
};

const getSiteHealthLabel = (
    health: 'normal' | 'warning' | 'critical',
    t: TranslateFn,
): string => {
    switch (health) {
        case 'normal':
            return t('site.health.normal', {
                defaultValue: 'Норма',
            });
        case 'warning':
            return t('site.health.warning', {
                defaultValue: 'Требует внимания',
            });
        case 'critical':
        default:
            return t('site.health.critical', {
                defaultValue: 'Критично',
            });
    }
};

const formatSiteContextSubtitle = (
    value: string | undefined,
): string | undefined => {
    const normalized = value?.trim();

    return normalized || undefined;
};

const formatReportSiteName = (
    site: {
        id: unknown;
        name?: unknown;
        code?: unknown;
    },
): string => {
    const name = String(site.name ?? '').trim();
    const code = String(site.code ?? '').trim();

    if (code) {
        return `${code} · ${name || code}`;
    }

    if (name) {
        return name;
    }

    return String(site.id);
};

const formatReportSiteSubtitle = (
    site: {
        region?: unknown;
    },
): string | undefined => {
    const region = String(site.region ?? '').trim();

    return region || undefined;
};

const getCameraSectionSubtitle = (
    t: TranslateFn,
): string => {
    return t('dashboard.sections.cameras.subtitle', {
        defaultValue: 'Состояние камер по площадкам',
    });
};

const getCameraSectionHelp = (
    t: TranslateFn,
): DashboardSectionHelpViewModel => {
    return {
        buttonAriaLabel: t(
            'dashboard.sections.cameras.help.buttonAriaLabel',
            { defaultValue: 'Открыть помощь по секции камер' },
        ),
        closeLabel: t(
            'dashboard.sections.cameras.help.closeLabel',
            { defaultValue: 'Закрыть помощь' },
        ),
        title: t(
            'dashboard.sections.cameras.help.title',
            { defaultValue: 'Как читать секцию камер' },
        ),
        description: t(
            'dashboard.sections.cameras.help.description',
            { defaultValue: 'Секция показывает текущее состояние камер по площадкам и помогает быстро находить зоны внимания.' },
        ),
        items: [
            {
                label: t(
                    'dashboard.sections.cameras.help.items.periodTitle',
                    { defaultValue: 'Период' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.periodDescription',
                    { defaultValue: 'Показывает период, за который учитываются инциденты в секции.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.onlineTitle',
                    { defaultValue: 'Онлайн' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.onlineDescription',
                    { defaultValue: 'Количество камер со статусом online на площадке.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.attentionTitle',
                    { defaultValue: 'Требуют внимания' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.attentionDescription',
                    { defaultValue: 'Камеры не в status=online или камеры с давно устаревшим last seen.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.siteIncidentsTitle',
                    { defaultValue: 'Инциденты площадки' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.siteIncidentsDescription',
                    { defaultValue: 'Суммарное число инцидентов по выбранной площадке за активный период.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.cameraStateTitle',
                    { defaultValue: 'Состояние камеры' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.cameraStateDescription',
                    { defaultValue: 'Плашка состояния строится из текущего camera.status.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.reasonTitle',
                    { defaultValue: 'Причина' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.reasonDescription',
                    { defaultValue: 'Причина формируется из camera.status_reason или из факта устаревшего последнего сигнала.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.statusTitle',
                    { defaultValue: 'Статус' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.statusDescription',
                    { defaultValue: 'Статус камеры берётся напрямую из упрощённого контракта: online / offline / problem / initializing / unknown.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.diagnosticsTitle',
                    { defaultValue: 'Диагностика' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.diagnosticsDescription',
                    { defaultValue: 'В метриках карточки показывается объяснение текущего проблемного состояния камеры.' },
                ),
            },
            {
                label: t(
                    'dashboard.sections.cameras.help.items.signalTitle',
                    { defaultValue: 'Последний сигнал' },
                ),
                description: t(
                    'dashboard.sections.cameras.help.items.signalDescription',
                    { defaultValue: 'Если lastSeenAt отсутствует или сильно устарел, камера попадает в attention.' },
                ),
            },
        ],
    };
};

const getCameraReasonLabel = (args: {
    reasonCode: DashboardCameraReasonCode;
    statusReason: unknown;
    t: TranslateFn;
    locale: string;
}): string => {
    const {
        reasonCode,
        statusReason,
        t,
        locale,
    } = args;

    if (typeof statusReason === 'string' && statusReason.trim()) {
        return formatCameraStatusReason(statusReason, {
            t,
            locale,
        });
    }

    switch (reasonCode) {
        case 'offline':
            return t('dashboard.labels.cameraReasonOffline', {
                defaultValue: 'Камера недоступна',
            });

        case 'stale':
            return t('dashboard.labels.cameraReasonStale', {
                defaultValue: 'Последний сигнал давно не поступал',
            });

        case 'initializing':
            return formatCameraStatusReason('initializing', {
                t,
                locale,
            });

        case 'stable':
            return t('dashboard.labels.cameraReasonStable', {
                defaultValue: 'Камера работает стабильно',
            });

        case 'unknown':
        default:
            return t('dashboard.labels.cameraReasonUnknownHealth', {
                defaultValue: 'Требуется проверка состояния',
            });
    }
};

const createInitialReportDraft = (
    range: {
        from: Date;
        to: Date;
    },
): ReportDraftState => {
    return {
        from: formatDateInputValue(range.from),
        to: formatDateInputValue(range.to),
        sitesMode: 'all',
        selectedSiteIds: [],
        mediaMode: 'videosOrLinks',
        isSubmitting: false,
        submitErrorMessage: undefined,
    };
};

const resolveReportSubmitHandler = (
    props?: DashboardWorkspaceWidgetProps,
): DashboardWorkspaceWidgetPropsWithReportSubmit['onIncidentReportSubmit'] => {
    const maybeHandler = (
        props as DashboardWorkspaceWidgetPropsWithReportSubmit | undefined
    )?.onIncidentReportSubmit;

    return typeof maybeHandler === 'function'
        ? maybeHandler
        : undefined;
};

const buildIncidentReportSubmitPayload = (args: {
    draft: ReportDraftState;
    scope?: unknown;
}): DashboardIncidentReportSubmitPayload | null => {
    const {
        draft,
        scope,
    } = args;

    const parsedFrom = parseDateInputValue(draft.from);
    const parsedTo = parseDateInputValue(draft.to);

    if (!parsedFrom || !parsedTo) {
        return null;
    }

    const normalizedFrom = startOfDay(parsedFrom);
    const normalizedTo = endOfDay(parsedTo);

    if (normalizedFrom.getTime() > normalizedTo.getTime()) {
        return null;
    }

    return {
        from: normalizedFrom.toISOString(),
        to: normalizedTo.toISOString(),
        siteIds: draft.sitesMode === 'selected'
            ? [...draft.selectedSiteIds]
            : undefined,
        sitesMode: draft.sitesMode,
        mediaMode: draft.mediaMode,
        scope,
    };
};

export function useDashboardWorkspaceWidget(
    props?: DashboardWorkspaceWidgetProps,
): DashboardWorkspaceWidgetModel {
    const { t, locale } = useTranslation();

    const [incidentRange, setIncidentRange] = useState<{
        from: Date;
        to: Date;
    }>(() => createPresetRange(30));

    const [isIncidentReportModalOpen, setIsIncidentReportModalOpen] = useState(false);
    const [reportDraft, setReportDraft] = useState<ReportDraftState>(() => (
        createInitialReportDraft(createPresetRange(30))
    ));

    const [, setLastSubmittedIncidentReportPayload] =
        useState<DashboardIncidentReportSubmitPayload | null>(null);

    const dashboard = useOverviewDashboard({
        scope: props?.scope,
        incidentTimeRange: incidentRange,
    });

    const reportSubmitHandler = useMemo(
        () => resolveReportSubmitHandler(props),
        [props],
    );

    const numberFormatter = useMemo(
        () => buildNumberFormatter(locale),
        [locale],
    );
    const shortDateFormatter = useMemo(
        () => buildShortDateFormatter(locale),
        [locale],
    );
    const longDateFormatter = useMemo(
        () => buildLongDateFormatter(locale),
        [locale],
    );

    const formatCount = useCallback((value: number): string => {
        return numberFormatter.format(value);
    }, [numberFormatter]);

    const sectionPeriodLabel = useMemo(
        () =>
            t('dashboard.labels.sectionPeriodDays', {
                days: formatCount(dashboard.incidentsTrend.windowDays),
                defaultValue: `${formatCount(dashboard.incidentsTrend.windowDays)} дн.`,
            }),
        [
            t,
            dashboard.incidentsTrend.windowDays,
            formatCount,
        ],
    );

    const recentTrendCount = useMemo(() => {
        return dashboard.incidentsTrend.points.reduce(
            (acc, point) => acc + point.count,
            0,
        );
    }, [dashboard.incidentsTrend.points]);

    const handleIncidentPeriodApply = useCallback((
        next: {
            from: string;
            to: string;
        },
    ): void => {
        const parsedFrom = parseDateInputValue(next.from);
        const parsedTo = parseDateInputValue(next.to);
        const minAllowedDate = startOfDay(MIN_INCIDENT_PERIOD_DATE);
        const maxAllowedDate = endOfDay(new Date());

        if (!parsedFrom || !parsedTo) {
            return;
        }

        const normalizedFrom = startOfDay(parsedFrom);
        const normalizedTo = endOfDay(parsedTo);

        if (normalizedFrom.getTime() > normalizedTo.getTime()) {
            return;
        }

        if (normalizedFrom.getTime() < minAllowedDate.getTime()) {
            return;
        }

        if (normalizedTo.getTime() > maxAllowedDate.getTime()) {
            return;
        }

        setIncidentRange({
            from: normalizedFrom,
            to: normalizedTo,
        });
    }, []);

    const handleIncidentPresetSelect = useCallback((
        key: '7d' | '30d',
    ): void => {
        setIncidentRange(
            key === '7d'
                ? createPresetRange(7)
                : createPresetRange(30),
        );
    }, []);

    const handleOpenIncidentReportModal = useCallback((): void => {
        setReportDraft(createInitialReportDraft(incidentRange));
        setIsIncidentReportModalOpen(true);
    }, [incidentRange]);

    const handleCloseIncidentReportModal = useCallback((): void => {
        setIsIncidentReportModalOpen(false);
        setReportDraft((current) => ({
            ...current,
            isSubmitting: false,
            submitErrorMessage: undefined,
        }));
    }, []);

    const handleReportFromChange = useCallback((value: string): void => {
        setReportDraft((current) => ({
            ...current,
            from: value,
            submitErrorMessage: undefined,
        }));
    }, []);

    const handleReportToChange = useCallback((value: string): void => {
        setReportDraft((current) => ({
            ...current,
            to: value,
            submitErrorMessage: undefined,
        }));
    }, []);

    const handleReportSitesModeChange = useCallback((
        value: DashboardIncidentReportSitesMode,
    ): void => {
        setReportDraft((current) => ({
            ...current,
            sitesMode: value,
            selectedSiteIds: value === 'all'
                ? []
                : current.selectedSiteIds,
            submitErrorMessage: undefined,
        }));
    }, []);

    const handleReportSiteToggle = useCallback((siteId: string): void => {
        setReportDraft((current) => {
            const nextSelectedSiteIds = current.selectedSiteIds.includes(siteId)
                ? current.selectedSiteIds.filter((value) => value !== siteId)
                : [...current.selectedSiteIds, siteId];

            return {
                ...current,
                selectedSiteIds: nextSelectedSiteIds,
                submitErrorMessage: undefined,
            };
        });
    }, []);

    const handleReportMediaModeChange = useCallback((
        value: DashboardIncidentReportMediaMode,
    ): void => {
        setReportDraft((current) => ({
            ...current,
            mediaMode: value,
            submitErrorMessage: undefined,
        }));
    }, []);

    const reportSiteOptions = useMemo<
        ReadonlyArray<DashboardIncidentReportSiteOptionViewModel>
    >(
        () => {
            const selectedSiteIdSet = new Set(reportDraft.selectedSiteIds);

            return [...dashboard.raw.sites]
                .map((site) => ({
                    siteId: String(site.id),
                    name: formatReportSiteName(site),
                    subtitle: formatReportSiteSubtitle(site),
                    checked: selectedSiteIdSet.has(String(site.id)),
                    disabled: false,
                }))
                .sort((left, right) => left.name.localeCompare(right.name, locale, {
                    sensitivity: 'base',
                    numeric: true,
                }));
        },
        [
            dashboard.raw.sites,
            locale,
            reportDraft.selectedSiteIds,
        ],
    );

    const reportMediaOptions = useMemo<
        ReadonlyArray<DashboardIncidentReportMediaOptionViewModel>
    >(
        () => [
            {
                value: 'linksOnly',
                label: t('dashboard.sections.incidents.report.media.linksOnly', {
                    defaultValue: 'Только ссылки',
                }),
            },
            {
                value: 'videosOrLinks',
                label: t('dashboard.sections.incidents.report.media.videosOrLinks', {
                    defaultValue: 'Видео или ссылки',
                }),
            },
        ],
        [t],
    );

    const reportValidation = useMemo(() => {
        const parsedFrom = parseDateInputValue(reportDraft.from);
        const parsedTo = parseDateInputValue(reportDraft.to);
        const minAllowedDate = startOfDay(MIN_INCIDENT_PERIOD_DATE);
        const maxAllowedDate = endOfDay(new Date());

        if (!reportDraft.from || !reportDraft.to) {
            return {
                validationMessage: t(
                    'dashboard.sections.incidents.report.validation.requiredDates',
                    { defaultValue: 'Укажите период отчёта.' },
                ),
                isSubmitDisabled: true,
            };
        }

        if (!parsedFrom || !parsedTo) {
            return {
                validationMessage: t(
                    'dashboard.sections.incidents.report.validation.invalidDates',
                    { defaultValue: 'Проверь даты отчёта.' },
                ),
                isSubmitDisabled: true,
            };
        }

        const normalizedFrom = startOfDay(parsedFrom);
        const normalizedTo = endOfDay(parsedTo);

        if (normalizedFrom.getTime() > normalizedTo.getTime()) {
            return {
                validationMessage: t(
                    'dashboard.sections.incidents.report.validation.rangeOrder',
                    { defaultValue: 'Дата начала не может быть позже даты окончания.' },
                ),
                isSubmitDisabled: true,
            };
        }

        if (normalizedFrom.getTime() < minAllowedDate.getTime()) {
            return {
                validationMessage: t(
                    'dashboard.sections.incidents.report.validation.minDate',
                    {
                        date: formatDateInputValue(MIN_INCIDENT_PERIOD_DATE),
                        defaultValue: `Минимальная дата отчёта: ${formatDateInputValue(MIN_INCIDENT_PERIOD_DATE)}.`,
                    },
                ),
                isSubmitDisabled: true,
            };
        }

        if (normalizedTo.getTime() > maxAllowedDate.getTime()) {
            return {
                validationMessage: t(
                    'dashboard.sections.incidents.report.validation.maxDate',
                    {
                        date: formatDateInputValue(new Date()),
                        defaultValue: `Максимальная дата отчёта: ${formatDateInputValue(new Date())}.`,
                    },
                ),
                isSubmitDisabled: true,
            };
        }

        if (
            reportDraft.sitesMode === 'selected' &&
            reportDraft.selectedSiteIds.length <= 0
        ) {
            return {
                validationMessage: t(
                    'dashboard.sections.incidents.report.validation.sitesRequired',
                    { defaultValue: 'Выбери хотя бы одну площадку.' },
                ),
                isSubmitDisabled: true,
            };
        }

        if (reportDraft.isSubmitting) {
            return {
                validationMessage: undefined,
                isSubmitDisabled: true,
            };
        }

        return {
            validationMessage: undefined,
            isSubmitDisabled: false,
        };
    }, [reportDraft, t]);

    const handleSubmitIncidentReport = useCallback((): void => {
        if (reportValidation.isSubmitDisabled) {
            return;
        }

        const payload = buildIncidentReportSubmitPayload({
            draft: reportDraft,
            scope: props?.scope,
        });

        if (!payload) {
            setReportDraft((current) => ({
                ...current,
                submitErrorMessage: t(
                    'dashboard.sections.incidents.report.submit.invalidPayload',
                    { defaultValue: 'Не удалось подготовить параметры отчёта.' },
                ),
            }));
            return;
        }

        setReportDraft((current) => ({
            ...current,
            isSubmitting: true,
            submitErrorMessage: undefined,
        }));

        void (async () => {
            try {
                setLastSubmittedIncidentReportPayload(payload);

                if (reportSubmitHandler) {
                    await reportSubmitHandler(payload);
                }

                setIsIncidentReportModalOpen(false);
                setReportDraft(createInitialReportDraft(incidentRange));
            } catch {
                setReportDraft((current) => ({
                    ...current,
                    isSubmitting: false,
                    submitErrorMessage: t(
                        'dashboard.sections.incidents.report.submit.failed',
                        { defaultValue: 'Не удалось отправить запрос на формирование отчёта.' },
                    ),
                }));
                return;
            }

            setReportDraft((current) => ({
                ...current,
                isSubmitting: false,
                submitErrorMessage: undefined,
            }));
        })();
    }, [
        incidentRange,
        props?.scope,
        reportDraft,
        reportSubmitHandler,
        reportValidation.isSubmitDisabled,
        t,
    ]);

    const reportSelectedSitesSummary = useMemo(() => {
        if (reportDraft.sitesMode === 'all') {
            return t(
                'dashboard.sections.incidents.report.summary.allSites',
                { defaultValue: 'Выбраны все площадки' },
            );
        }

        if (reportSiteOptions.length <= 0) {
            return t(
                'dashboard.sections.incidents.report.summary.noSites',
                { defaultValue: 'Список площадок временно недоступен' },
            );
        }

        return t(
            'dashboard.sections.incidents.report.summary.selectedSites',
            {
                selected: formatCount(reportDraft.selectedSiteIds.length),
                total: formatCount(reportSiteOptions.length),
                defaultValue: `Выбрано площадок: ${formatCount(reportDraft.selectedSiteIds.length)} из ${formatCount(reportSiteOptions.length)}`,
            },
        );
    }, [
        reportDraft.sitesMode,
        reportDraft.selectedSiteIds.length,
        reportSiteOptions.length,
        t,
        formatCount,
    ]);

    const reportAction = useMemo<DashboardIncidentReportActionViewModel>(
        () => ({
            label: t('dashboard.sections.incidents.report.generate', {
                defaultValue: 'Сформировать отчёт',
            }),
            disabled: false,
            isLoading: reportDraft.isSubmitting,
            onClick: handleOpenIncidentReportModal,
        }),
        [
            t,
            reportDraft.isSubmitting,
            handleOpenIncidentReportModal,
        ],
    );

    const reportModalValidationMessage = useMemo(() => {
        return reportValidation.validationMessage ??
            reportDraft.submitErrorMessage;
    }, [
        reportValidation.validationMessage,
        reportDraft.submitErrorMessage,
    ]);

    const reportModal = useMemo<DashboardIncidentReportModalViewModel>(
        () => ({
            open: isIncidentReportModalOpen,

            title: t('dashboard.sections.incidents.report.modal.title', {
                defaultValue: 'Формирование отчёта по инцидентам',
            }),
            subtitle: t('dashboard.sections.incidents.report.modal.subtitle', {
                defaultValue: 'Выбери период, площадки и режим медиа для будущего отчёта.',
            }),

            fromLabel: t('dashboard.sections.incidents.report.period.from', {
                defaultValue: 'От',
            }),
            toLabel: t('dashboard.sections.incidents.report.period.to', {
                defaultValue: 'До',
            }),
            fromValue: reportDraft.from,
            toValue: reportDraft.to,
            minDateValue: formatDateInputValue(MIN_INCIDENT_PERIOD_DATE),
            maxDateValue: formatDateInputValue(new Date()),

            sitesModeLabel: t('dashboard.sections.incidents.report.sitesMode.label', {
                defaultValue: 'Площадки',
            }),
            allSitesLabel: t('dashboard.sections.incidents.report.sitesMode.all', {
                defaultValue: 'Все площадки',
            }),
            selectedSitesLabel: t('dashboard.sections.incidents.report.sitesMode.selected', {
                defaultValue: 'Выбранные площадки',
            }),
            sitesMode: reportDraft.sitesMode,

            sitesLabel: t('dashboard.sections.incidents.report.sites.label', {
                defaultValue: 'Список площадок',
            }),
            sitesEmptyLabel: t('dashboard.sections.incidents.report.sites.empty', {
                defaultValue: 'Нет площадок для выбора',
            }),
            selectedSitesSummary: reportSelectedSitesSummary,
            siteOptions: reportSiteOptions,

            mediaModeLabel: t('dashboard.sections.incidents.report.media.label', {
                defaultValue: 'Медиа',
            }),
            mediaMode: reportDraft.mediaMode,
            mediaOptions: reportMediaOptions,

            cancelLabel: t('common.cancel', {
                defaultValue: 'Отмена',
            }),
            submitLabel: t('dashboard.sections.incidents.report.submit', {
                defaultValue: 'Сформировать отчёт',
            }),

            validationMessage: reportModalValidationMessage,
            isSubmitDisabled: reportValidation.isSubmitDisabled,
            isSubmitting: reportDraft.isSubmitting,

            onClose: handleCloseIncidentReportModal,
            onFromChange: handleReportFromChange,
            onToChange: handleReportToChange,
            onSitesModeChange: handleReportSitesModeChange,
            onToggleSite: handleReportSiteToggle,
            onMediaModeChange: handleReportMediaModeChange,
            onSubmit: handleSubmitIncidentReport,
        }),
        [
            t,
            isIncidentReportModalOpen,
            reportDraft,
            reportSelectedSitesSummary,
            reportSiteOptions,
            reportMediaOptions,
            reportModalValidationMessage,
            reportValidation.isSubmitDisabled,
            handleCloseIncidentReportModal,
            handleReportFromChange,
            handleReportToChange,
            handleReportSitesModeChange,
            handleReportSiteToggle,
            handleReportMediaModeChange,
            handleSubmitIncidentReport,
        ],
    );

    const sitesSectionHelp = useMemo<DashboardSectionHelpViewModel>(
        () => ({
            buttonAriaLabel: t(
                'dashboard.sections.sites.help.buttonAriaLabel',
                { defaultValue: 'Открыть помощь по секции площадок' },
            ),
            closeLabel: t(
                'dashboard.sections.sites.help.closeLabel',
                { defaultValue: 'Закрыть помощь' },
            ),
            title: t(
                'dashboard.sections.sites.help.title',
                { defaultValue: 'Как читать секцию площадок' },
            ),
            description: t(
                'dashboard.sections.sites.help.description',
                { defaultValue: 'Секция показывает производное состояние площадок на основе камер и инцидентов.' },
            ),
            items: [
                {
                    label: t(
                        'dashboard.sections.sites.help.items.periodTitle',
                        { defaultValue: 'Период' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.periodDescription',
                        { defaultValue: 'Период влияет на подсчёт инцидентов в секции.' },
                    ),
                },
                {
                    label: t(
                        'dashboard.sections.sites.help.items.nameTitle',
                        { defaultValue: 'Название' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.nameDescription',
                        { defaultValue: 'Название и код площадки.' },
                    ),
                },
                {
                    label: t(
                        'dashboard.sections.sites.help.items.contextTitle',
                        { defaultValue: 'Контекст' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.contextDescription',
                        { defaultValue: 'Дополнительная информация о площадке, например регион.' },
                    ),
                },
                {
                    label: t(
                        'dashboard.sections.sites.help.items.modeTitle',
                        { defaultValue: 'Режим площадки' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.modeDescription',
                        { defaultValue: 'Активна площадка или нет.' },
                    ),
                },
                {
                    label: t(
                        'dashboard.sections.sites.help.items.healthTitle',
                        { defaultValue: 'Состояние площадки' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.healthDescription',
                        { defaultValue: 'Нормально / требует внимания / критично — рассчитывается по камерам и инцидентам.' },
                    ),
                },
                {
                    label: t(
                        'dashboard.sections.sites.help.items.camerasOnlineTitle',
                        { defaultValue: 'Камеры онлайн' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.camerasOnlineDescription',
                        { defaultValue: 'Сколько камер на площадке имеют статус online.' },
                    ),
                },
                {
                    label: t(
                        'dashboard.sections.sites.help.items.camerasProblemTitle',
                        { defaultValue: 'Камеры внимания' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.camerasProblemDescription',
                        { defaultValue: 'Камеры вне online или камеры с устаревшим последним сигналом.' },
                    ),
                },
                {
                    label: t(
                        'dashboard.sections.sites.help.items.incidentsTitle',
                        { defaultValue: 'Инциденты' },
                    ),
                    description: t(
                        'dashboard.sections.sites.help.items.incidentsDescription',
                        { defaultValue: 'Количество недавних инцидентов по площадке.' },
                    ),
                },
            ],
        }),
        [t],
    );

    const cameraSectionSubtitle = useMemo(
        () => getCameraSectionSubtitle(t),
        [t],
    );

    const cameraSectionHelp = useMemo(
        () => getCameraSectionHelp(t),
        [t],
    );

    const kpiItems = useMemo<ReadonlyArray<DashboardKpiItemViewModel>>(
        () => [
            {
                key: 'sites',
                title: t('dashboard.kpi.sites.title', {
                    defaultValue: 'Площадки',
                }),
                value: formatCount(dashboard.kpis.totalSites),
                meta: t('dashboard.kpi.sites.meta', {
                    operational: formatCount(dashboard.kpis.operationalSites),
                    attention: formatCount(dashboard.kpis.problematicSites),
                    defaultValue: `Норма: ${formatCount(dashboard.kpis.operationalSites)} · Проблемные: ${formatCount(dashboard.kpis.problematicSites)}`,
                }),
                tone: getSitesKpiTone(
                    dashboard.kpis.totalSites,
                    dashboard.kpis.problematicSites,
                ),
            },
            {
                key: 'cameras',
                title: t('dashboard.kpi.cameras.title', {
                    defaultValue: 'Камеры',
                }),
                value: formatCount(dashboard.kpis.totalCameras),
                meta: t('dashboard.kpi.cameras.meta', {
                    online: formatCount(dashboard.kpis.onlineCameras),
                    attention: formatCount(dashboard.kpis.attentionCameras),
                    defaultValue: `Online: ${formatCount(dashboard.kpis.onlineCameras)} · Внимание: ${formatCount(dashboard.kpis.attentionCameras)}`,
                }),
                tone: getCamerasKpiTone(
                    dashboard.kpis.totalCameras,
                    dashboard.kpis.attentionCameras,
                ),
            },
            {
                key: 'incidents',
                title: t('dashboard.kpi.incidents.title', {
                    defaultValue: 'Инциденты',
                }),
                value: formatCount(dashboard.kpis.totalIncidents),
                meta: t('dashboard.kpi.incidents.meta', {
                    trendDays: formatCount(
                        dashboard.incidentsTrend.windowDays,
                    ),
                    recent: formatCount(recentTrendCount),
                    critical: formatCount(
                        dashboard.kpis.criticalIncidents,
                    ),
                    defaultValue: `Период: ${formatCount(dashboard.incidentsTrend.windowDays)} дн. · За период: ${formatCount(recentTrendCount)} · Критичных: ${formatCount(dashboard.kpis.criticalIncidents)}`,
                }),
                tone: getIncidentsKpiTone(recentTrendCount),
            },
        ],
        [
            dashboard.kpis,
            dashboard.incidentsTrend.windowDays,
            recentTrendCount,
            t,
            formatCount,
        ],
    );

    const sitesHealthItems = useMemo<
        ReadonlyArray<DashboardSiteHealthItemViewModel>
    >(
        () =>
            dashboard.sitesHealth.items.map((item) => ({
                siteId: String(item.siteId),
                name: item.name,
                subtitle: formatSiteContextSubtitle(item.subtitle),
                tone: mapDashboardStateToTone(item.state),
                statusTone: getSiteModeTone(item.mode),
                healthTone: getSiteHealthTone(item.health),
                statusLabel: getSiteModeLabel(item.mode, t),
                healthLabel: t('dashboard.labels.siteHealthPill', {
                    value: getSiteHealthLabel(item.health, t),
                    defaultValue: getSiteHealthLabel(item.health, t),
                }),
                camerasLabel: t('dashboard.labels.siteCamerasOnline', {
                    online: formatCount(item.onlineCameras),
                    total: formatCount(item.totalCameras),
                    defaultValue: `Онлайн: ${formatCount(item.onlineCameras)} / ${formatCount(item.totalCameras)}`,
                }),
                attentionLabel: t('dashboard.labels.siteAttentionCameras', {
                    value: formatCount(item.attentionCameras),
                    defaultValue: `Требуют внимания: ${formatCount(item.attentionCameras)}`,
                }),
                incidentsLabel: t('dashboard.labels.siteIncidentsCount', {
                    value: formatCount(item.recentIncidentCount),
                    defaultValue: `Инциденты: ${formatCount(item.recentIncidentCount)}`,
                }),
            })),
        [
            dashboard.sitesHealth.items,
            t,
            formatCount,
        ],
    );

    const cameraGroupItems = useMemo(
        () =>
            dashboard.camerasBySite.groups.map((group) => ({
                siteId: String(group.siteId),
                name: group.name,
                subtitle: formatSiteContextSubtitle(group.subtitle),
                onlineValue: `${formatCount(group.onlineCameras)} / ${formatCount(group.totalCameras)}`,
                attentionValue: formatCount(group.attentionCameras),
                incidentsValue: formatCount(group.recentIncidentCount),
                displayedCamerasLabel: t(
                    'dashboard.labels.cameraGroupDisplayedCameras',
                    {
                        value: formatCount(group.cameras.length),
                        defaultValue: `Показано камер: ${formatCount(group.cameras.length)}`,
                    },
                ),
                expandLabel: t('dashboard.labels.cameraGroupExpand', {
                    defaultValue: 'Развернуть',
                }),
                collapseLabel: t('dashboard.labels.cameraGroupCollapse', {
                    defaultValue: 'Свернуть',
                }),
                cameras: group.cameras.map((camera) => {
                    const reasonCode = getDashboardCameraReasonCode({
                        status: camera.status,
                        statusReason: camera.statusReason,
                        isStale: camera.isStale,
                    });
                    const tone = mapDashboardCameraReasonToTone(
                        reasonCode,
                    );

                    const formattedStatus = formatCameraStatus(
                        camera.status,
                        { t, locale },
                    );

                    const formattedReason = getCameraReasonLabel({
                        reasonCode,
                        statusReason: camera.statusReason,
                        t,
                        locale,
                    });

                    const formattedLastSeen = formatCameraLastSeenAt(
                        camera.lastSeenAt,
                        { t, locale },
                    );

                    return {
                        cameraId: String(camera.cameraId),
                        name: camera.name,
                        tone,
                        stateLabel: formattedStatus,
                        reasonLabel: formattedReason,
                        statusLabel: t(
                            'dashboard.labels.cameraStatusMetric',
                            {
                                value: formattedStatus,
                                defaultValue: `Статус: ${formattedStatus}`,
                            },
                        ),
                        healthLabel: t(
                            'dashboard.labels.cameraDiagnosticStatusMetric',
                            {
                                value: formattedReason,
                                defaultValue: `Диагностика: ${formattedReason}`,
                            },
                        ),
                        lastSeenLabel: t(
                            camera.isStale
                                ? 'dashboard.labels.cameraLastSignalMetricStale'
                                : 'dashboard.labels.cameraLastSignalMetric',
                            {
                                value: formattedLastSeen,
                                defaultValue: camera.isStale
                                    ? `Последний сигнал устарел: ${formattedLastSeen}`
                                    : `Последний сигнал: ${formattedLastSeen}`,
                            },
                        ),
                        incidentsLabel: t(
                            'dashboard.labels.cameraIncidentsDetailed',
                            {
                                value: formatCount(
                                    camera.recentIncidentCount,
                                ),
                                defaultValue: `Инциденты: ${formatCount(camera.recentIncidentCount)}`,
                            },
                        ),
                        inferenceLabel: '',
                    };
                }),
            })),
        [
            dashboard.camerasBySite.groups,
            t,
            locale,
            formatCount,
        ],
    );

    const incidentPeriodButtonLabel = useMemo(() => {
        return `${longDateFormatter.format(incidentRange.from)} — ${longDateFormatter.format(incidentRange.to)}`;
    }, [
        longDateFormatter,
        incidentRange.from,
        incidentRange.to,
    ]);

    const preset7Range = useMemo(
        () => createPresetRange(7),
        [],
    );
    const preset30Range = useMemo(
        () => createPresetRange(30),
        [],
    );

    const minAllowedDateValue = useMemo(
        () => formatDateInputValue(MIN_INCIDENT_PERIOD_DATE),
        [],
    );
    const maxAllowedDateValue = useMemo(
        () => formatDateInputValue(new Date()),
        [],
    );

    const periodModel = useMemo<DashboardDateRangePickerViewModel>(
        () => ({
            buttonLabel: incidentPeriodButtonLabel,
            title: t('dashboard.sections.incidents.period.title', {
                defaultValue: 'Период',
            }),
            fromLabel: t('dashboard.sections.incidents.period.from', {
                defaultValue: 'От',
            }),
            toLabel: t('dashboard.sections.incidents.period.to', {
                defaultValue: 'До',
            }),
            applyLabel: t('dashboard.sections.incidents.period.apply', {
                defaultValue: 'Применить',
            }),
            presets: [
                {
                    key: '7d',
                    label: t('dashboard.sections.incidents.period.last7Days', {
                        defaultValue: '7 дней',
                    }),
                    isActive: isSameRange(
                        incidentRange,
                        preset7Range,
                    ),
                },
                {
                    key: '30d',
                    label: t('dashboard.sections.incidents.period.last30Days', {
                        defaultValue: '30 дней',
                    }),
                    isActive: isSameRange(
                        incidentRange,
                        preset30Range,
                    ),
                },
            ],
            fromValue: formatDateInputValue(incidentRange.from),
            toValue: formatDateInputValue(incidentRange.to),
            minDateValue: minAllowedDateValue,
            maxDateValue: maxAllowedDateValue,
            maxRangeDays: Number.MAX_SAFE_INTEGER,
            onApply: handleIncidentPeriodApply,
            onPresetSelect: handleIncidentPresetSelect,
        }),
        [
            incidentPeriodButtonLabel,
            t,
            incidentRange,
            preset7Range,
            preset30Range,
            minAllowedDateValue,
            maxAllowedDateValue,
            handleIncidentPeriodApply,
            handleIncidentPresetSelect,
        ],
    );

    const incidentsTrendPoints = useMemo<
        ReadonlyArray<DashboardTrendPointViewModel>
    >(
        () =>
            dashboard.incidentsTrend.points.map((point) => ({
                key: point.key,
                label: shortDateFormatter.format(point.startAt),
                count: point.count,
                countLabel: formatCount(point.count),
            })),
        [
            dashboard.incidentsTrend.points,
            shortDateFormatter,
            formatCount,
        ],
    );

    const incidentsTrendSection = useMemo<DashboardIncidentsTrendSectionViewModel>(
        () => ({
            title: t('dashboard.sections.incidents.title', {
                defaultValue: 'Динамика инцидентов',
            }),
            subtitle: t('dashboard.sections.incidents.subtitle', {
                defaultValue: 'Количество инцидентов по дням за выбранный период',
            }),
            period: periodModel,
            summaryLabel: t('dashboard.labels.incidentsSummary', {
                total: formatCount(dashboard.incidentsTrend.totalCount),
                critical: formatCount(dashboard.incidentsTrend.criticalCount),
                defaultValue: `Всего: ${formatCount(dashboard.incidentsTrend.totalCount)} · Критичных: ${formatCount(dashboard.incidentsTrend.criticalCount)}`,
            }),
            chartEmptyLabel: t(
                'dashboard.sections.incidents.chartEmpty',
                { defaultValue: 'Нет данных для отображения графика' },
            ),
            chartAxisXLabel: t(
                'dashboard.sections.incidents.chartAxisX',
                { defaultValue: 'Дата' },
            ),
            chartAxisYLabel: t(
                'dashboard.sections.incidents.chartAxisY',
                { defaultValue: 'Количество инцидентов' },
            ),
            points: incidentsTrendPoints,
        }),
        [
            t,
            periodModel,
            dashboard.incidentsTrend.totalCount,
            dashboard.incidentsTrend.criticalCount,
            incidentsTrendPoints,
            formatCount,
        ],
    );

    return useMemo<DashboardWorkspaceWidgetModel>(
        () => ({
            title: t('dashboard.title', {
                defaultValue: 'Обзор',
            }),
            subtitle: t('dashboard.subtitle', {
                defaultValue: 'Сводка по площадкам, камерам и инцидентам',
            }),
            partialErrorTitle: t('dashboard.partial.title', {
                defaultValue: 'Часть данных не загрузилась',
            }),
            partialErrorSubtitle: t('dashboard.partial.subtitle', {
                defaultValue: 'Дашборд показан частично. Проверь источник ошибок и обнови данные.',
            }),
            loadingTitle: t('dashboard.loading.title', {
                defaultValue: 'Загрузка дашборда',
            }),
            loadingSubtitle: t('dashboard.loading.subtitle', {
                defaultValue: 'Получаем площадки, камеры и инциденты.',
            }),
            emptyTitle: t('dashboard.empty.title', {
                defaultValue: 'Нет данных',
            }),
            emptySubtitle: t('dashboard.empty.subtitle', {
                defaultValue: 'Пока нечего показывать в обзорной панели.',
            }),
            state: {
                isLoading: dashboard.state.isLoading,
                isFetching: dashboard.state.isFetching,
                isEmpty: dashboard.state.isEmpty,
                hasPartialData: dashboard.state.hasPartialData,
                error: dashboard.state.error,
            },
            kpiSection: {
                title: t('dashboard.sections.kpi.title', {
                    defaultValue: 'Ключевые показатели',
                }),
                subtitle: t('dashboard.sections.kpi.subtitle', {
                    defaultValue: 'Быстрый обзор состояния системы',
                }),
                items: kpiItems,
            },
            sitesHealthSection: {
                title: t('dashboard.sections.sites.title', {
                    defaultValue: 'Состояние площадок',
                }),
                subtitle: t('dashboard.sections.sites.subtitle', {
                    defaultValue: 'Площадки с приоритетом внимания сверху',
                }),
                periodLabel: sectionPeriodLabel,
                help: sitesSectionHelp,
                emptyLabel: t('dashboard.sections.sites.empty', {
                    defaultValue: 'Нет площадок для отображения',
                }),
                items: sitesHealthItems,
            },
            camerasBySiteSection: {
                title: t('dashboard.sections.cameras.title', {
                    defaultValue: 'Камеры по площадкам',
                }),
                subtitle: cameraSectionSubtitle,
                periodLabel: sectionPeriodLabel,
                createActionLabel: t(
                    'dashboard.sections.cameras.actions.createSite',
                    {
                        defaultValue: 'Создать площадку',
                    },
                ),
                help: cameraSectionHelp,
                emptyLabel: t('dashboard.sections.cameras.empty', {
                    defaultValue: 'Нет камер для отображения',
                }),
                groups: cameraGroupItems,
            },
            incidentsTrendSection,
            reportAction,
            reportModal,
        }),
        [
            t,
            dashboard.state,
            kpiItems,
            sectionPeriodLabel,
            sitesSectionHelp,
            sitesHealthItems,
            cameraSectionSubtitle,
            cameraSectionHelp,
            cameraGroupItems,
            incidentsTrendSection,
            reportAction,
            reportModal,
        ],
    );
}