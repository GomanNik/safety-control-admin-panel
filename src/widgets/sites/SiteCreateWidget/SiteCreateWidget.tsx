// =====================
// File: src/widgets/sites/SiteCreateWidget/SiteCreateWidget.tsx
// Purpose:
// - Full site setup widget for create flow
// - Saves the site first
// - Then allows optional camera setup in the same flow
// - Calls onSaved only when the full create flow is finished
// - Uses richer setup-oriented visual composition
// =====================

import {
    useMemo,
    useState,
    type JSX,
} from "react";

import {
    formatSiteDisplaySubtitle,
    type Site,
} from "../../../entities/site";

import { useI18nContext } from "../../../shared/i18n";
import {
    Button,
    Card,
    Grid,
    Heading,
    Stack,
    Text,
} from "../../../shared/ui";

import { SiteFormWidget } from "../SiteFormWidget";
import { SiteCamerasSetupSection } from "../_shared/SiteCamerasSetupSection";

import type { SiteCreateWidgetProps } from "./types";
import styles from "../SiteEditWidget/ui/SiteEditWidget.module.css";

function normalizeText(value: unknown): string {
    return String(value ?? "").trim();
}

function buildSiteAddressSummary(
    site: Site,
    fallback: string,
): string {
    const parts = [
        normalizeText(site.address?.country),
        normalizeText(site.address?.region),
        normalizeText(site.address?.city),
        normalizeText(site.address?.addressLine1),
        normalizeText(site.address?.postalCode),
    ].filter(Boolean);

    return parts.length > 0
        ? parts.join(", ")
        : fallback;
}

export function SiteCreateWidget(
    props: SiteCreateWidgetProps,
): JSX.Element {
    const { t, locale } = useI18nContext();

    const {
        className,
        onSaved,
        onCancel,
        ...rest
    } = props;

    const [createdSite, setCreatedSite] = useState<Site | null>(null);
    const [cameraCount, setCameraCount] = useState(0);

    const notAvailableLabel = t("common.notAvailable", {
        defaultValue: "—",
    });

    const createdSiteSubtitle = useMemo(() => {
        if (!createdSite) {
            return notAvailableLabel;
        }

        return formatSiteDisplaySubtitle(createdSite, {
            t,
            locale,
            emptyValue: notAvailableLabel,
        });
    }, [createdSite, locale, notAvailableLabel, t]);

    const createdSiteAddress = useMemo(() => {
        if (!createdSite) {
            return notAvailableLabel;
        }

        return buildSiteAddressSummary(
            createdSite,
            createdSiteSubtitle || notAvailableLabel,
        );
    }, [createdSite, createdSiteSubtitle, notAvailableLabel]);

    const summaryHint = cameraCount > 0
        ? t("site.create.summary.hintWithCameras", {
            defaultValue:
                "Камеры уже добавлены. Проверьте список и завершите настройку.",
        })
        : t("site.create.summary.hintWithoutCameras", {
            defaultValue:
                "Можно завершить создание сейчас или пропустить шаг камер.",
        });

    if (!createdSite) {
        return (
            <SiteFormWidget
                className={className}
                mode="create"
                onSaved={(site) => {
                    setCreatedSite(site);
                    setCameraCount(0);
                }}
                onCancel={onCancel}
                {...rest}
            />
        );
    }

    return (
        <div
            className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
            {...rest}
        >
            <Stack gap={16}>
                <Card
                    variant="default"
                    padding="md"
                    header={
                        <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderCopy}>
                                <div className={styles.sectionEyebrow}>
                                    {t("site.create.summary.eyebrow", {
                                        defaultValue: "Шаг 2 из 2",
                                    })}
                                </div>

                                <Heading level={3}>
                                    {t("site.create.summary.title", {
                                        defaultValue: "Площадка создана",
                                    })}
                                </Heading>

                                <Text variant="muted">
                                    {t("site.create.summary.subtitle", {
                                        defaultValue:
                                            "Теперь можно сразу добавить камеры. Этот шаг необязателен.",
                                    })}
                                </Text>
                            </div>

                            <div className={styles.sectionHeaderMeta}>
                                <div className={styles.metricPill}>
                                    <span className={styles.metricPillLabel}>
                                        {t("site.create.summary.fields.cameras", {
                                            defaultValue: "Добавлено камер",
                                        })}
                                    </span>
                                    <span className={styles.metricPillValue}>
                                        {cameraCount}
                                    </span>
                                </div>
                            </div>
                        </div>
                    }
                >
                    <Stack gap={14}>
                        <Grid
                            columns="auto-fit"
                            minColumnWidth={220}
                            gap={12}
                        >
                            <div className={styles.infoCard}>
                                <Text variant="caption" className={styles.infoCardLabel}>
                                    {t("site.create.summary.fields.site", {
                                        defaultValue: "Площадка",
                                    })}
                                </Text>

                                <Text className={styles.infoCardValue}>
                                    {createdSite.name}
                                </Text>
                            </div>

                            <div className={styles.infoCard}>
                                <Text variant="caption" className={styles.infoCardLabel}>
                                    {t("site.create.summary.fields.code", {
                                        defaultValue: "Код",
                                    })}
                                </Text>

                                <Text className={styles.infoCardValue}>
                                    {normalizeText(createdSite.code) || notAvailableLabel}
                                </Text>
                            </div>

                            <div className={styles.infoCard}>
                                <Text variant="caption" className={styles.infoCardLabel}>
                                    {t("site.create.summary.fields.address", {
                                        defaultValue: "Адрес",
                                    })}
                                </Text>

                                <Text className={styles.infoCardValue}>
                                    {createdSiteAddress}
                                </Text>
                            </div>

                            <div className={styles.infoCard}>
                                <Text variant="caption" className={styles.infoCardLabel}>
                                    {t("site.create.summary.fields.region", {
                                        defaultValue: "Регион / город",
                                    })}
                                </Text>

                                <Text className={styles.infoCardValue}>
                                    {createdSiteSubtitle}
                                </Text>
                            </div>
                        </Grid>

                        <div className={styles.noteBox}>
                            <Text variant="muted">
                                {summaryHint}
                            </Text>
                        </div>
                    </Stack>
                </Card>

                <SiteCamerasSetupSection
                    siteId={createdSite.id}
                    translationPrefix="site.create.cameras"
                    onCountChange={setCameraCount}
                />

                <Card
                    variant="default"
                    padding="md"
                >
                    <div className={styles.footerActions}>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                onSaved?.(createdSite);
                            }}
                        >
                            {t("site.create.actions.finish", {
                                defaultValue: "Завершить настройку",
                            })}
                        </Button>

                        {cameraCount === 0 ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    onSaved?.(createdSite);
                                }}
                            >
                                {t("site.create.actions.skipCameras", {
                                    defaultValue: "Пропустить шаг камер",
                                })}
                            </Button>
                        ) : null}
                    </div>
                </Card>
            </Stack>
        </div>
    );
}