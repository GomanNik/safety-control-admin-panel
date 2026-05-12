// =====================
// File: src/widgets/overview/dashboard-section-help/DashboardSectionHelpPopover.tsx
// Purpose:
// - Compact quick-help dialog for dashboard sections
// - Uses lighter header and card-based help items
// - Keeps the close action visually distinct and circular
// =====================

import {
    useEffect,
    useId,
    useState,
} from 'react';
import type { JSX } from 'react';

import {
    Card,
    Heading,
    Stack,
    Text,
} from '../../../shared/ui';

import type { DashboardSectionHelpViewModel } from '../DashboardWorkspaceWidget';

export interface DashboardSectionHelpPopoverProps {
    help: DashboardSectionHelpViewModel;
}

export function DashboardSectionHelpPopover(
    props: DashboardSectionHelpPopoverProps,
): JSX.Element {
    const { help } = props;

    const [isOpen, setIsOpen] = useState(false);
    const titleId = useId();

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        const previousPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        document.body.style.overflow = 'hidden';

        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }

        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.style.paddingRight = previousPaddingRight;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleKeyDown = (
            event: KeyboardEvent,
        ): void => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <>
            <button
                type="button"
                aria-label={help.buttonAriaLabel}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className="ui-help-trigger"
                onClick={() => setIsOpen(true)}
            >
                ?
            </button>

            {isOpen ? (
                <div
                    className="ui-help-backdrop"
                    onClick={() => setIsOpen(false)}
                >
                    <div
                        className="ui-help-dialog-shell"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Card
                            variant="elevated"
                            padding="lg"
                            className="ui-help-dialog ui-help-dialog--compact"
                        >
                            <div
                                className="ui-help-dialog__content"
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby={titleId}
                            >
                                <div className="ui-help-dialog__header">
                                    <div className="ui-help-dialog__title-block">
                                        <Heading
                                            id={titleId}
                                            level={3}
                                            size="md"
                                        >
                                            {help.title}
                                        </Heading>

                                        {help.description ? (
                                            <Text
                                                variant="muted"
                                                className="ui-help-dialog__subtitle"
                                            >
                                                {help.description}
                                            </Text>
                                        ) : null}
                                    </div>

                                    <button
                                        type="button"
                                        aria-label={help.closeLabel}
                                        className="ui-help-dialog__close"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <span aria-hidden="true">×</span>
                                    </button>
                                </div>

                                <Stack
                                    gap={10}
                                    className="ui-help-list ui-help-list--grid"
                                >
                                    {help.items.map((item) => (
                                        <article
                                            key={item.label}
                                            className="ui-help-list__item ui-help-list__item--compact"
                                        >
                                            <div className="ui-help-list__term">
                                                {item.label}
                                            </div>

                                            <Text
                                                variant="muted"
                                                className="ui-help-list__description"
                                            >
                                                {item.description}
                                            </Text>
                                        </article>
                                    ))}
                                </Stack>
                            </div>
                        </Card>
                    </div>
                </div>
            ) : null}
        </>
    );
}