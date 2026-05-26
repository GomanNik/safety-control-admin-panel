// =====================
// src/widgets/errors/AppErrorBoundaryWidget/AppErrorBoundaryWidget.tsx
// =====================

/**
 * Global error boundary widget.
 *
 * Catches render/runtime errors and shows a safe fallback UI.
 * Text is taken from shared/i18n.
 */

import type {
    ErrorInfo,
    JSX,
    ReactNode,
} from 'react';
import { Component } from 'react';

import {
    Button,
    Card,
    Heading,
    Text,
} from '../../../shared/ui';
import { getGlobalLogger } from '../../../shared/logging';
import { useTranslation } from '../../../shared/i18n';

import '../errors.css';
import type { AppErrorBoundaryWidgetProps } from './types';

type State = { error?: Error };

type I18nStrings = {
    title: string;
    subtitle: string;
    details: string;
    reload: string;
};

type InnerProps = AppErrorBoundaryWidgetProps & {
    i18n: I18nStrings;
};

const logger = getGlobalLogger()
    .child('widgets')
    .child('errors')
    .child('AppErrorBoundaryWidget');

class AppErrorBoundaryInner extends Component<InnerProps, State> {
    state: State = {};

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        logger.error('App crashed (error boundary)', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            componentStack: info.componentStack,
        });
    }

    componentDidUpdate(prevProps: InnerProps): void {
        if (
            prevProps.resetKey !== this.props.resetKey &&
            this.state.error
        ) {
            this.setState({ error: undefined });
        }
    }

    private reset = (): void => {
        this.setState({ error: undefined });

        if (this.props.onReset) {
            try {
                this.props.onReset();
            } catch (error) {
                logger.error('onReset failed', { error });
            }
        }
    };

    private renderDefaultFallback(error: Error): JSX.Element {
        const { i18n, showTechnicalDetails } = this.props;
        const shouldShowTechnicalDetails =
            showTechnicalDetails ?? import.meta.env.DEV;

        return (
            <section
                className="app-error-boundary-widget"
                aria-labelledby="app-error-boundary-title"
            >
                <div className="app-error-boundary-widget__shell">
                    <Card
                        variant="elevated"
                        padding="lg"
                        className="app-error-boundary-widget__card"
                        header={(
                            <div className="app-error-boundary-widget__hero">
                                <div
                                    className="app-error-boundary-widget__sign"
                                    aria-hidden="true"
                                >
                                    !
                                </div>

                                <Heading
                                    id="app-error-boundary-title"
                                    level={1}
                                    size="lg"
                                    className="app-error-boundary-widget__title"
                                >
                                    {i18n.title}
                                </Heading>

                                <Text
                                    variant="muted"
                                    className="app-error-boundary-widget__subtitle"
                                >
                                    {i18n.subtitle}
                                </Text>
                            </div>
                        )}
                        footer={(
                            <div className="app-error-boundary-widget__actions">
                                <Button
                                    variant="secondary"
                                    onClick={this.reset}
                                >
                                    {i18n.reload}
                                </Button>
                            </div>
                        )}
                    >
                        {shouldShowTechnicalDetails ? (
                            <details className="app-error-boundary-widget__details">
                                <summary className="app-error-boundary-widget__summary">
                                    {i18n.details}
                                </summary>

                                <div className="app-error-boundary-widget__meta">
                                    <Text variant="muted">
                                        {error.message || 'Error'}
                                    </Text>

                                    {error.stack ? (
                                        <pre className="app-error-boundary-widget__stack">
                                            {error.stack}
                                        </pre>
                                    ) : null}
                                </div>
                            </details>
                        ) : null}
                    </Card>
                </div>
            </section>
        );
    }

    render(): ReactNode {
        const { children, fallback } = this.props;
        const { error } = this.state;

        if (!error) {
            return children;
        }

        if (fallback) {
            return fallback({ error, reset: this.reset });
        }

        return this.renderDefaultFallback(error);
    }
}

export function AppErrorBoundaryWidget(
    props: AppErrorBoundaryWidgetProps,
): JSX.Element {
    const { t } = useTranslation();

    const i18n: I18nStrings = {
        title: t('errors.boundaryTitle'),
        subtitle: t('errors.boundarySubtitle'),
        details: t('errors.boundaryDetails'),
        reload: t('errors.boundaryReload'),
    };

    return <AppErrorBoundaryInner {...props} i18n={i18n} />;
}