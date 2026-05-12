// =====================
// src/widgets/errors/HttpErrorWidget/HttpErrorWidget.tsx
// =====================

/**
 * HTTP error widget.
 *
 * - Accepts unknown error, normalizes it to HttpErrorLike
 * - Ignores aborted errors (returns null)
 * - Text is taken from shared/i18n
 */

import type { JSX } from 'react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    Button,
    Card,
    Heading,
    Text,
} from '../../../shared/ui';
import { getGlobalLogger } from '../../../shared/logging';
import {
    HttpErrorCode,
    isAbortLikeError,
    isApiError,
    isHttpError,
    normalizeHttpError,
} from '../../../shared/api';
import { useTranslation } from '../../../shared/i18n';

import '../errors.css';
import type { HttpErrorWidgetProps } from './types';

type ViewModel = {
    title: string;
    subtitle: string;

    code: HttpErrorCode;
    status?: number;
    url?: string;
    method?: string;

    correlationId?: string;
    retryAfter?: string;

    message: string;
};

type DetailItem = {
    key: string;
    label: string;
    value: string | number;
};

const logger = getGlobalLogger()
    .child('widgets')
    .child('errors')
    .child('HttpErrorWidget');

function pickHeader(
    headers: Record<string, string> | undefined,
    name: string,
): string | undefined {
    if (!headers) {
        return undefined;
    }

    const target = name.toLowerCase();

    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === target) {
            return headers[key];
        }
    }

    return undefined;
}

function buildViewModel(
    error: unknown,
    t: (key: string, opts?: Record<string, unknown>) => string,
): ViewModel {
    const normalized = isHttpError(error)
        ? error
        : normalizeHttpError(error);

    const apiPayloadMessage = isApiError(normalized)
        ? normalized.payload?.message
        : undefined;

    const correlationId =
        pickHeader(normalized.responseHeaders, 'x-correlation-id') ??
        pickHeader(normalized.responseHeaders, 'x-request-id');

    const retryAfter = pickHeader(
        normalized.responseHeaders,
        'retry-after',
    );

    const baseMessage =
        apiPayloadMessage ||
        normalized.message ||
        t('errors.actionFailed');

    const base: Omit<ViewModel, 'title' | 'subtitle'> = {
        code: normalized.code,
        status: normalized.status,
        url: normalized.url,
        method: normalized.method,
        correlationId,
        retryAfter,
        message: baseMessage,
    };

    switch (normalized.code) {
        case HttpErrorCode.Network:
            return {
                ...base,
                title: t('errors.titleNetwork'),
                subtitle: t('errors.hintCheckInternet'),
            };

        case HttpErrorCode.Timeout:
            return {
                ...base,
                title: t('errors.titleTimeout'),
                subtitle: t('errors.hintTryAgain'),
            };

        case HttpErrorCode.TooManyRequests:
            return {
                ...base,
                title: t('errors.titleTooManyRequests'),
                subtitle: retryAfter
                    ? t('errors.hintRetryAfter', { retryAfter })
                    : t('errors.hintTooManyRequests'),
            };

        case HttpErrorCode.Unauthorized:
            return {
                ...base,
                title: t('errors.titleUnauthorized'),
                subtitle: t('errors.hintEnterSystem'),
            };

        case HttpErrorCode.Forbidden:
            return {
                ...base,
                title: t('errors.titleForbidden'),
                subtitle: t('errors.hintNoRights'),
            };

        case HttpErrorCode.NotFound:
            return {
                ...base,
                title: t('errors.titleNotFound'),
                subtitle: t('errors.hintResourceNotFound'),
            };

        case HttpErrorCode.ValidationError:
            return {
                ...base,
                title: t('errors.titleValidation'),
                subtitle: t('errors.hintCheckFields'),
            };

        case HttpErrorCode.Conflict:
            return {
                ...base,
                title: t('errors.titleConflict'),
                subtitle: t('errors.hintDataChanged'),
            };

        case HttpErrorCode.ServerError:
            return {
                ...base,
                title: t('errors.titleServerError'),
                subtitle: t('errors.hintTryLater'),
            };

        case HttpErrorCode.BadRequest:
            return {
                ...base,
                title: t('errors.titleBadRequest'),
                subtitle: baseMessage,
            };

        case HttpErrorCode.Unknown:
        default:
            return {
                ...base,
                title: t('errors.httpTitle'),
                subtitle: baseMessage,
            };
    }
}

export function HttpErrorWidget(
    props: HttpErrorWidgetProps,
): JSX.Element | null {
    const {
        error,
        onRetry,
        onReset,
        defaultShowDetails = false,
    } = props;

    const { t, locale } = useTranslation();

    const shouldHide = !error || isAbortLikeError(error);

    const vm = useMemo(() => {
        if (shouldHide || !error) {
            return null;
        }

        return buildViewModel(error, t);
    }, [
        error,
        shouldHide,
        t,
        locale,
    ]);

    const [showDetails, setShowDetails] = useState<boolean>(
        defaultShowDetails,
    );

    useEffect(() => {
        setShowDetails(defaultShowDetails);
    }, [defaultShowDetails]);

    useEffect(() => {
        if (!vm) {
            return;
        }

        logger.warn('HTTP error widget rendered', {
            code: vm.code,
            status: vm.status,
            method: vm.method,
            url: vm.url,
            correlationId: vm.correlationId,
            retryAfter: vm.retryAfter,
        });
    }, [vm]);

    const detailItems = useMemo<DetailItem[]>(() => {
        if (!vm) {
            return [];
        }

        const items: DetailItem[] = [
            {
                key: 'code',
                label: t('errors.tech.code'),
                value: vm.code,
            },
            ...(vm.status != null
                ? [{
                    key: 'status',
                    label: t('errors.tech.status'),
                    value: vm.status,
                }]
                : []),
            ...(vm.method
                ? [{
                    key: 'method',
                    label: t('errors.tech.method'),
                    value: vm.method,
                }]
                : []),
            ...(vm.url
                ? [{
                    key: 'url',
                    label: t('errors.tech.url'),
                    value: vm.url,
                }]
                : []),
            ...(vm.correlationId
                ? [{
                    key: 'correlation',
                    label: t('errors.tech.correlation'),
                    value: vm.correlationId,
                }]
                : []),
            ...(vm.retryAfter
                ? [{
                    key: 'retry-after',
                    label: t('errors.tech.retryAfter'),
                    value: vm.retryAfter,
                }]
                : []),
            {
                key: 'message',
                label: t('errors.tech.message'),
                value: vm.message,
            },
        ];

        return items;
    }, [
        t,
        locale,
        vm,
    ]);

    if (!vm) {
        return null;
    }

    const hasActions = Boolean(onRetry || onReset);

    return (
        <section
            className="http-error-widget"
            aria-labelledby="http-error-widget-title"
        >
            <div className="http-error-widget__shell">
                <Card
                    variant="elevated"
                    padding="lg"
                    className="http-error-widget__card"
                    header={(
                        <div className="http-error-widget__hero">
                            <Heading
                                id="http-error-widget-title"
                                level={2}
                                size="lg"
                                className="http-error-widget__title"
                            >
                                {vm.title}
                            </Heading>

                            <Text
                                variant="muted"
                                className="http-error-widget__subtitle"
                            >
                                {vm.subtitle}
                            </Text>
                        </div>
                    )}
                    footer={hasActions ? (
                        <div className="http-error-widget__actions">
                            {onReset ? (
                                <Button
                                    variant="secondary"
                                    onClick={onReset}
                                >
                                    {t('errors.reset')}
                                </Button>
                            ) : null}

                            {onRetry ? (
                                <Button
                                    variant="primary"
                                    onClick={onRetry}
                                >
                                    {t('errors.retry')}
                                </Button>
                            ) : null}
                        </div>
                    ) : undefined}
                >
                    <div className="http-error-widget__toolbar">
                        <Heading
                            level={4}
                            size="sm"
                            className="http-error-widget__details-title"
                        >
                            {t('errors.httpDetails')}
                        </Heading>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setShowDetails((value) => !value);
                            }}
                        >
                            {showDetails
                                ? t('errors.hide')
                                : t('errors.show')}
                        </Button>
                    </div>

                    {showDetails ? (
                        <dl className="http-error-widget__details-list">
                            {detailItems.map((item) => (
                                <div
                                    key={item.key}
                                    className="http-error-widget__details-row"
                                >
                                    <dt className="http-error-widget__details-key">
                                        {item.label}
                                    </dt>
                                    <dd className="http-error-widget__details-value">
                                        {String(item.value)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    ) : null}
                </Card>
            </div>
        </section>
    );
}