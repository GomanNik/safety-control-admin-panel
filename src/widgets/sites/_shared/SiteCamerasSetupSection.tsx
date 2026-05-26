// =====================
// File: src/widgets/sites/_shared/SiteCamerasSetupSection.tsx
// Purpose:
// - Shared site cameras setup section for create/edit flows
// - Uses the real two-step camera create flow from feature layer:
//   1) connection check
//   2) create by verified token
// - Keeps widget responsibility on composition/UI only
// - Uses concise user-facing copy without technical noise
// =====================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type JSX,
} from "react";

import { useI18nContext } from "../../../shared/i18n";
import { Button, Card, Heading, Stack, Text } from "../../../shared/ui";

import {
    formatCameraStatus,
    useCameraListQuery,
    type Camera,
} from "../../../entities/camera";
import type { Site } from "../../../entities/site";

import {
    useCameraCreateFormState,
    useCameraDeleteModel,
    type CameraCreateFormValues,
    type CameraCreateValidationErrorCode,
    type CameraCreateValidationFieldId,
} from "../../../features/camera";

import styles from "../SiteEditWidget/ui/SiteEditWidget.module.css";

type TranslationPrefix = "site.edit.cameras" | "site.create.cameras";

type CameraFormFieldName = keyof CameraCreateFormValues;
type CameraTextFieldName = Exclude<CameraFormFieldName, "useTls">;

type CameraComposerTouchedState = Partial<Record<CameraFormFieldName, boolean>>;

type ScopedTranslate = (
    suffix: string,
    params?: Record<string, unknown>,
) => string;

interface TextFieldConfig {
    name: CameraTextFieldName;
    labelKey: string;
    placeholderKey: string;
    type?: "text" | "password";
    inputMode?:
        | "none"
        | "text"
        | "tel"
        | "url"
        | "email"
        | "numeric"
        | "decimal"
        | "search";
    autoComplete?: string;
    wide?: boolean;
}

const FEATURE_VALIDATION_FIELDS: readonly CameraCreateValidationFieldId[] = [
    "siteId",
    "name",
    "location",
    "host",
    "port",
    "username",
    "password",
    "path",
    "connectTimeoutMs",
    "readTimeoutMs",
] as const;

const IDENTITY_FIELDS: readonly TextFieldConfig[] = [
    {
        name: "name",
        labelKey: "fields.name",
        placeholderKey: "placeholders.name",
    },
    {
        name: "location",
        labelKey: "fields.location",
        placeholderKey: "placeholders.location",
    },
] as const;

const CONNECTION_FIELDS: readonly TextFieldConfig[] = [
    {
        name: "host",
        labelKey: "fields.host",
        placeholderKey: "placeholders.host",
        autoComplete: "off",
    },
    {
        name: "port",
        labelKey: "fields.port",
        placeholderKey: "placeholders.port",
        inputMode: "numeric",
        autoComplete: "off",
    },
    {
        name: "username",
        labelKey: "fields.username",
        placeholderKey: "placeholders.username",
        autoComplete: "username",
    },
    {
        name: "password",
        labelKey: "fields.password",
        placeholderKey: "placeholders.password",
        type: "password",
        autoComplete: "current-password",
    },
    {
        name: "path",
        labelKey: "fields.path",
        placeholderKey: "placeholders.path",
        wide: true,
        autoComplete: "off",
    },
] as const;

const OVERRIDE_FIELDS: readonly TextFieldConfig[] = [
    {
        name: "vendor",
        labelKey: "fields.vendor",
        placeholderKey: "placeholders.vendor",
    },
    {
        name: "model",
        labelKey: "fields.model",
        placeholderKey: "placeholders.model",
    },
    {
        name: "serialNumber",
        labelKey: "fields.serialNumber",
        placeholderKey: "placeholders.serialNumber",
        wide: true,
    },
] as const;

function normalizeText(value: unknown): string {
    return String(value ?? "").trim();
}

function formatOptionalNumber(value: unknown): string {
    return typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
}

function isFeatureValidatedField(
    field: CameraFormFieldName,
): field is CameraCreateValidationFieldId {
    return FEATURE_VALIDATION_FIELDS.includes(
        field as CameraCreateValidationFieldId,
    );
}

function getErrorMessage(value: unknown, fallback: string): string {
    if (
        value &&
        typeof value === "object" &&
        "message" in value &&
        typeof (value as { message?: unknown }).message === "string"
    ) {
        const message = normalizeText((value as { message: string }).message);

        if (message) {
            return message;
        }
    }

    return fallback;
}

function formatDateTime(
    value: Date | null | undefined,
    locale: string,
): string {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return "";
    }

    return value.toLocaleString(locale);
}

function formatConnectionSummary(
    host: string | undefined,
    port: number | undefined,
    path: string | undefined,
    usernameMasked: string | undefined,
): string {
    return [
        normalizeText(host),
        formatOptionalNumber(port),
        normalizeText(path),
        normalizeText(usernameMasked),
    ]
        .filter(Boolean)
        .join(" · ");
}

function formatDiscoveredDeviceSummary(
    vendor: string | undefined,
    model: string | undefined,
    serialNumber: string | undefined,
): string {
    return [
        normalizeText(vendor),
        normalizeText(model),
        normalizeText(serialNumber),
    ]
        .filter(Boolean)
        .join(" · ");
}

function formatDiscoveredStreamSummary(
    codec: string | undefined,
    width: number | undefined,
    height: number | undefined,
    fps: number | undefined,
): string {
    const size =
        typeof width === "number" && typeof height === "number"
            ? `${width}×${height}`
            : "";

    const fpsValue =
        typeof fps === "number" && Number.isFinite(fps)
            ? `${fps} FPS`
            : "";

    return [
        normalizeText(codec),
        size,
        fpsValue,
    ]
        .filter(Boolean)
        .join(" · ");
}

function translateFeatureCameraFieldError(
    field: CameraCreateValidationFieldId,
    error: CameraCreateValidationErrorCode | undefined,
    tx: ScopedTranslate,
): string | null {
    if (!error) {
        return null;
    }

    switch (error) {
        case "required":
            switch (field) {
                case "siteId":
                    return tx("create.validation.siteIdRequired");

                case "name":
                    return tx("create.validation.nameRequired");

                case "location":
                    return tx("create.validation.locationRequired");

                case "host":
                    return tx("create.validation.hostRequired");

                case "port":
                    return tx("create.validation.portRequired");

                case "username":
                    return tx("create.validation.usernameRequired");

                case "password":
                    return tx("create.validation.passwordRequired");

                case "path":
                    return tx("create.validation.pathRequired");

                case "connectTimeoutMs":
                    return tx("create.validation.connectTimeoutRequired");

                case "readTimeoutMs":
                    return tx("create.validation.readTimeoutRequired");

                default:
                    return tx("create.validation.generic");
            }

        case "invalid_number":
            switch (field) {
                case "port":
                    return tx("create.validation.portInvalid");

                case "connectTimeoutMs":
                    return tx("create.validation.connectTimeoutInvalid");

                case "readTimeoutMs":
                    return tx("create.validation.readTimeoutInvalid");

                default:
                    return tx("create.validation.numberInvalid");
            }

        case "out_of_range":
            switch (field) {
                case "port":
                    return tx("create.validation.portRange");

                case "connectTimeoutMs":
                    return tx("create.validation.connectTimeoutRange");

                case "readTimeoutMs":
                    return tx("create.validation.readTimeoutRange");

                default:
                    return tx("create.validation.rangeInvalid");
            }

        default:
            return tx("create.validation.generic");
    }
}

export interface SiteCamerasSetupSectionProps {
    siteId?: Site["id"] | null;
    translationPrefix: TranslationPrefix;
    onCountChange?: (count: number) => void;
}

export function SiteCamerasSetupSection(
    props: SiteCamerasSetupSectionProps,
): JSX.Element {
    const {
        siteId,
        translationPrefix,
        onCountChange,
    } = props;

    const { t, locale } = useI18nContext();

    const tx = useCallback<ScopedTranslate>(
        (suffix, params) =>
            t(`${translationPrefix}.${suffix}`, params),
        [t, translationPrefix],
    );

    const cameraListQuery = useCameraListQuery(
        {
            filters: {
                siteId: siteId ?? undefined,
            },
            pagination: {
                page: 1,
                pageSize: 20,
            },
        },
        {
            enabled: Boolean(siteId),
            keepPreviousData: true,
        },
    );

    const cameraCreateForm = useCameraCreateFormState();
    const cameraDeleteModel = useCameraDeleteModel();

    const {
        values: cameraCreateValues,
        errors: cameraCreateErrors,
        canCheck,
        canCreate,
        checking: checkingCamera,
        creating: creatingCamera,
        isVerified,
        requiresRecheck,
        checkResult,
        checkError,
        createError,
        setFieldValue: setCameraCreateFieldValue,
        reset: resetCameraCreateForm,
        submitCheck: submitCameraCheck,
        submitCreate: submitCameraCreate,
    } = cameraCreateForm;

    const formLocked = checkingCamera || creatingCamera;

    const [deletingCameraId, setDeletingCameraId] = useState<Camera["id"] | null>(
        null,
    );
    const [submitted, setSubmitted] = useState(false);
    const [touched, setTouched] = useState<CameraComposerTouchedState>({});

    const initializedSiteIdRef = useRef<Site["id"] | null | undefined>(undefined);

    useEffect(() => {
        if (initializedSiteIdRef.current === siteId) {
            return;
        }

        initializedSiteIdRef.current = siteId;
        setSubmitted(false);
        setTouched({});
        resetCameraCreateForm();
        setCameraCreateFieldValue("siteId", siteId ?? "");
    }, [siteId, resetCameraCreateForm, setCameraCreateFieldValue]);

    const cameras = useMemo(() => {
        return [...(cameraListQuery.data?.items ?? [])].sort((left, right) => {
            return String(left.name).localeCompare(String(right.name), locale, {
                sensitivity: "base",
                numeric: true,
            });
        });
    }, [cameraListQuery.data?.items, locale]);

    useEffect(() => {
        onCountChange?.(cameras.length);
    }, [cameras.length, onCountChange]);

    const markFieldTouched = useCallback(
        (field: CameraFormFieldName): void => {
            setTouched((prev) =>
                prev[field]
                    ? prev
                    : {
                        ...prev,
                        [field]: true,
                    },
            );
        },
        [],
    );

    const getVisibleFieldError = useCallback(
        (field: CameraFormFieldName): string | null => {
            if (!submitted && !touched[field]) {
                return null;
            }

            if (!isFeatureValidatedField(field)) {
                return null;
            }

            return translateFeatureCameraFieldError(
                field,
                cameraCreateErrors[field],
                tx,
            );
        },
        [cameraCreateErrors, submitted, touched, tx],
    );

    const resetComposerState = useCallback((): void => {
        setSubmitted(false);
        setTouched({});
        resetCameraCreateForm();
        setCameraCreateFieldValue("siteId", siteId ?? "");
    }, [resetCameraCreateForm, setCameraCreateFieldValue, siteId]);

    const handleCheckCamera = useCallback(async (): Promise<void> => {
        setSubmitted(true);

        if (!siteId) {
            return;
        }

        await submitCameraCheck();
    }, [siteId, submitCameraCheck]);

    const handleCreateCamera = useCallback(async (): Promise<void> => {
        setSubmitted(true);

        if (!siteId) {
            return;
        }

        const created = await submitCameraCreate();

        if (!created) {
            return;
        }

        resetComposerState();
        await cameraListQuery.refetch();
    }, [cameraListQuery, resetComposerState, siteId, submitCameraCreate]);

    const handleSubmit = useCallback(
        async (event: FormEvent<HTMLFormElement>): Promise<void> => {
            event.preventDefault();

            if (isVerified && !requiresRecheck) {
                await handleCreateCamera();
                return;
            }

            await handleCheckCamera();
        },
        [handleCheckCamera, handleCreateCamera, isVerified, requiresRecheck],
    );

    const handleTextInputChange = useCallback(
        (name: CameraTextFieldName) =>
            (event: ChangeEvent<HTMLInputElement>): void => {
                setCameraCreateFieldValue(name, event.target.value);
            },
        [setCameraCreateFieldValue],
    );

    const handleDeleteCamera = useCallback(
        async (cameraId: Camera["id"]): Promise<void> => {
            if (cameraDeleteModel.deleting) {
                return;
            }

            const confirmed =
                typeof window === "undefined"
                    ? true
                    : window.confirm(tx("deleteConfirm"));

            if (!confirmed) {
                return;
            }

            setDeletingCameraId(cameraId);

            try {
                const deleted = await cameraDeleteModel.deleteOne(cameraId);

                if (deleted) {
                    await cameraListQuery.refetch();
                }
            } finally {
                setDeletingCameraId(null);
            }
        },
        [cameraDeleteModel, cameraListQuery, tx],
    );

    const renderTextField = useCallback(
        (config: TextFieldConfig): JSX.Element => {
            const visibleError = getVisibleFieldError(config.name);

            return (
                <label
                    key={config.name}
                    className={[
                        styles.field,
                        config.wide ? styles.fieldWide : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                >
                    <Text variant="caption" className={styles.fieldLabel}>
                        {tx(config.labelKey)}
                    </Text>

                    <input
                        className={[
                            styles.control,
                            visibleError ? styles.controlError : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        type={config.type ?? "text"}
                        inputMode={config.inputMode}
                        autoComplete={config.autoComplete}
                        value={cameraCreateValues[config.name]}
                        disabled={formLocked}
                        placeholder={tx(config.placeholderKey)}
                        onChange={handleTextInputChange(config.name)}
                        onBlur={() => {
                            markFieldTouched(config.name);
                        }}
                    />

                    {visibleError ? (
                        <Text className={styles.fieldError}>
                            {visibleError}
                        </Text>
                    ) : null}
                </label>
            );
        },
        [
            cameraCreateValues,
            formLocked,
            getVisibleFieldError,
            handleTextInputChange,
            markFieldTouched,
            tx,
        ],
    );

    const siteErrorMessage =
        submitted && cameraCreateErrors.siteId
            ? translateFeatureCameraFieldError(
                "siteId",
                cameraCreateErrors.siteId,
                tx,
            )
            : null;

    const checkErrorMessage = checkError
        ? getErrorMessage(
            checkError,
            tx("check.error"),
        )
        : null;

    const createErrorMessage = createError
        ? getErrorMessage(
            createError,
            tx("create.error"),
        )
        : null;

    const deleteErrorMessage = cameraDeleteModel.deleteError
        ? getErrorMessage(
            cameraDeleteModel.deleteError,
            tx("deleteError"),
        )
        : null;

    const loadErrorMessage = cameraListQuery.error
        ? getErrorMessage(
            cameraListQuery.error,
            tx("loadError"),
        )
        : null;

    const verificationStateTitle = requiresRecheck
        ? tx("check.state.recheckTitle")
        : isVerified
            ? tx("check.state.verifiedTitle")
            : tx("check.state.initialTitle");

    const verificationStateDescription = requiresRecheck
        ? tx("check.state.recheckDescription")
        : isVerified
            ? tx("check.state.verifiedDescription")
            : canCheck
                ? tx("check.state.readyDescription")
                : tx("check.state.fillDescription");

    const sourcePreviewSummary = checkResult?.sourcePreview
        ? formatConnectionSummary(
            checkResult.sourcePreview.host,
            checkResult.sourcePreview.port,
            checkResult.sourcePreview.path,
            checkResult.sourcePreview.usernameMasked,
        )
        : "";

    const discoveredDeviceSummary = checkResult?.discoveredDevice
        ? formatDiscoveredDeviceSummary(
            checkResult.discoveredDevice.vendor,
            checkResult.discoveredDevice.model,
            checkResult.discoveredDevice.serialNumber,
        )
        : "";

    const discoveredStreamSummary = checkResult?.discoveredStream
        ? formatDiscoveredStreamSummary(
            checkResult.discoveredStream.codec,
            checkResult.discoveredStream.width,
            checkResult.discoveredStream.height,
            checkResult.discoveredStream.fps,
        )
        : "";

    const diagnosticsSummary =
        typeof checkResult?.diagnostics?.responseTimeMs === "number"
            ? tx("check.diagnostics.responseTime", {
                value: checkResult.diagnostics.responseTimeMs,
            })
            : "";

    const expiresAtSummary = checkResult?.checkExpiresAt
        ? tx("check.expiresAt", {
            value: formatDateTime(checkResult.checkExpiresAt, locale),
        })
        : "";

    return (
        <Card
            variant="default"
            padding="md"
            header={
                <div className={styles.sectionHeader}>
                    <div className={styles.sectionHeaderCopy}>
                        <div className={styles.sectionEyebrow}>
                            {tx("eyebrow")}
                        </div>

                        <Heading level={3}>
                            {tx("title")}
                        </Heading>

                        <Text variant="muted">
                            {tx("subtitle")}
                        </Text>
                    </div>

                    <div className={styles.sectionHeaderMeta}>
                        <div className={styles.metricPill}>
                            <span className={styles.metricPillLabel}>
                                {tx("totalLabel")}
                            </span>
                            <span className={styles.metricPillValue}>
                                {cameras.length}
                            </span>
                        </div>
                    </div>
                </div>
            }
        >
            {!siteId ? (
                <div className={styles.emptyState}>
                    <Text variant="muted">
                        {tx("siteRequired")}
                    </Text>
                </div>
            ) : (
                <Stack gap={18}>
                    <div className={styles.setupShell}>
                        <form
                            className={styles.cameraComposer}
                            onSubmit={(event) => {
                                void handleSubmit(event);
                            }}
                        >
                            <div className={styles.cameraComposerHeader}>
                                <div>
                                    <Heading level={4}>
                                        {tx("composer.title")}
                                    </Heading>

                                    <Text variant="muted">
                                        {tx("composer.subtitle")}
                                    </Text>
                                </div>
                            </div>

                            <div
                                className={[
                                    styles.statusCard,
                                    requiresRecheck
                                        ? styles.statusCardWarning
                                        : isVerified
                                            ? styles.statusCardSuccess
                                            : styles.statusCardNeutral,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            >
                                <Text className={styles.statusCardTitle}>
                                    {verificationStateTitle}
                                </Text>

                                <Text variant="muted">
                                    {verificationStateDescription}
                                </Text>

                                {checkResult ? (
                                    <div className={styles.statusFacts}>
                                        <div className={styles.statusFact}>
                                            {tx("check.status", {
                                                value: checkResult.status,
                                            })}
                                        </div>

                                        {sourcePreviewSummary ? (
                                            <div className={styles.statusFact}>
                                                {tx("check.sourcePreview", {
                                                    value: sourcePreviewSummary,
                                                })}
                                            </div>
                                        ) : null}

                                        {discoveredDeviceSummary ? (
                                            <div className={styles.statusFact}>
                                                {tx("check.discoveredDevice", {
                                                    value: discoveredDeviceSummary,
                                                })}
                                            </div>
                                        ) : null}

                                        {discoveredStreamSummary ? (
                                            <div className={styles.statusFact}>
                                                {tx("check.discoveredStream", {
                                                    value: discoveredStreamSummary,
                                                })}
                                            </div>
                                        ) : null}

                                        {diagnosticsSummary ? (
                                            <div className={styles.statusFact}>
                                                {diagnosticsSummary}
                                            </div>
                                        ) : null}

                                        {expiresAtSummary ? (
                                            <div className={styles.statusFact}>
                                                {expiresAtSummary}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            <div className={styles.formSection}>
                                <div className={styles.formSectionHeader}>
                                    <Text className={styles.formSectionTitle}>
                                        {tx("sections.identity.title")}
                                    </Text>

                                    <Text
                                        variant="muted"
                                        className={styles.formSectionDescription}
                                    >
                                        {tx("sections.identity.description")}
                                    </Text>
                                </div>

                                <div className={styles.formGrid}>
                                    {IDENTITY_FIELDS.map(renderTextField)}
                                </div>
                            </div>

                            <div className={styles.formSection}>
                                <div className={styles.formSectionHeader}>
                                    <Text className={styles.formSectionTitle}>
                                        {tx("sections.connection.title")}
                                    </Text>

                                    <Text
                                        variant="muted"
                                        className={styles.formSectionDescription}
                                    >
                                        {tx("sections.connection.description")}
                                    </Text>
                                </div>

                                <div className={styles.formGrid}>
                                    {CONNECTION_FIELDS.map(renderTextField)}
                                </div>
                            </div>

                            <div className={styles.formSection}>
                                <div className={styles.formSectionHeader}>
                                    <Text className={styles.formSectionTitle}>
                                        {tx("sections.overrides.title")}
                                    </Text>

                                    <Text
                                        variant="muted"
                                        className={styles.formSectionDescription}
                                    >
                                        {tx("sections.overrides.description")}
                                    </Text>
                                </div>

                                <div className={styles.formGrid}>
                                    {OVERRIDE_FIELDS.map(renderTextField)}
                                </div>
                            </div>

                            {siteErrorMessage ? (
                                <Text className={styles.errorText}>
                                    {siteErrorMessage}
                                </Text>
                            ) : null}

                            {checkErrorMessage ? (
                                <Text className={styles.errorText}>
                                    {checkErrorMessage}
                                </Text>
                            ) : null}

                            {createErrorMessage ? (
                                <Text className={styles.errorText}>
                                    {createErrorMessage}
                                </Text>
                            ) : null}

                            <Text variant="muted" className={styles.statusHint}>
                                {requiresRecheck
                                    ? tx("actions.hint.recheck")
                                    : isVerified
                                        ? tx("actions.hint.createReady")
                                        : tx("actions.hint.checkRequired")}
                            </Text>

                            <div className={styles.actionsRow}>
                                <Button
                                    type="button"
                                    variant={isVerified && !requiresRecheck ? "outline" : "primary"}
                                    size="sm"
                                    disabled={formLocked || !siteId}
                                    onClick={() => {
                                        void handleCheckCamera();
                                    }}
                                >
                                    {checkingCamera
                                        ? tx("actions.checking")
                                        : isVerified && !requiresRecheck
                                            ? tx("actions.recheck")
                                            : tx("actions.check")}
                                </Button>

                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    disabled={formLocked || !siteId || !canCreate}
                                >
                                    {creatingCamera
                                        ? tx("actions.creating")
                                        : tx("actions.create")}
                                </Button>

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={formLocked}
                                    onClick={resetComposerState}
                                >
                                    {tx("actions.reset")}
                                </Button>
                            </div>
                        </form>

                        <div className={styles.cameraListPanel}>
                            <div className={styles.cameraListPanelHeader}>
                                <div>
                                    <Heading level={4}>
                                        {tx("list.title")}
                                    </Heading>

                                    <Text variant="muted">
                                        {tx("list.subtitle")}
                                    </Text>
                                </div>
                            </div>

                            {deleteErrorMessage ? (
                                <Text className={styles.errorText}>
                                    {deleteErrorMessage}
                                </Text>
                            ) : null}

                            {loadErrorMessage ? (
                                <Text className={styles.errorText}>
                                    {loadErrorMessage}
                                </Text>
                            ) : null}

                            {cameraListQuery.isLoading && !cameraListQuery.data ? (
                                <div className={styles.emptyState}>
                                    <Text variant="muted">
                                        {tx("loading")}
                                    </Text>
                                </div>
                            ) : cameras.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Text variant="muted">
                                        {tx("empty")}
                                    </Text>
                                </div>
                            ) : (
                                <div className={styles.cameraList}>
                                    {cameras.map((camera) => (
                                        <article
                                            key={camera.id}
                                            className={styles.cameraItem}
                                        >
                                            <div className={styles.cameraItemCopy}>
                                                <div className={styles.cameraItemTop}>
                                                    <Heading level={4}>
                                                        {camera.name}
                                                    </Heading>

                                                    <span className={styles.cameraStatusPill}>
                                                        {formatCameraStatus(camera.status, {
                                                            t,
                                                            locale,
                                                        })}
                                                    </span>
                                                </div>

                                                <Text variant="muted">
                                                    {[
                                                        normalizeText(camera.location),
                                                        normalizeText(camera.vendor),
                                                        normalizeText(camera.model),
                                                        normalizeText(camera.serialNumber),
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </Text>
                                            </div>

                                            <div className={styles.cameraItemActions}>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={deletingCameraId !== null}
                                                    onClick={() => {
                                                        void handleDeleteCamera(camera.id);
                                                    }}
                                                >
                                                    {deletingCameraId === camera.id
                                                        ? tx("actions.deleting")
                                                        : tx("actions.delete")}
                                                </Button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </Stack>
            )}
        </Card>
    );
}