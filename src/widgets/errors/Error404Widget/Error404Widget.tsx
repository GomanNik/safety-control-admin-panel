// =====================
// src/widgets/errors/Error404Widget/Error404Widget.tsx
// =====================

/**
 * 404 widget (page-level UI).
 * Text is taken from shared/i18n.
 */

import type { JSX } from 'react';

import {
    Button,
    Card,
    Heading,
    Text,
} from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';

import '../errors.css';
import type { Error404WidgetProps } from './types';

export function Error404Widget(props: Error404WidgetProps): JSX.Element {
    const { onBack, onGoHome } = props;
    const { t } = useTranslation();

    return (
        <section
            className="error-404-widget"
            aria-labelledby="error-404-title"
        >
            <div className="error-404-widget__shell">
                <Card
                    variant="elevated"
                    padding="lg"
                    className="error-404-widget__card"
                    header={(
                        <div className="error-404-widget__hero">
                            <div
                                className="error-404-widget__code"
                                aria-hidden="true"
                            >
                                404
                            </div>

                            <Heading
                                id="error-404-title"
                                level={1}
                                size="lg"
                                className="error-404-widget__title"
                            >
                                {t('errors.notFoundTitle')}
                            </Heading>

                            <Text
                                variant="muted"
                                className="error-404-widget__subtitle"
                            >
                                {t('errors.notFoundSubtitle')}
                            </Text>
                        </div>
                    )}
                >
                    <div className="error-404-widget__actions">
                        {onBack ? (
                            <Button
                                variant="secondary"
                                onClick={onBack}
                            >
                                {t('errors.back')}
                            </Button>
                        ) : null}

                        {onGoHome ? (
                            <Button
                                variant="primary"
                                onClick={onGoHome}
                            >
                                {t('errors.goHome')}
                            </Button>
                        ) : null}
                    </div>
                </Card>
            </div>
        </section>
    );
}