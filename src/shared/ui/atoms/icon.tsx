// =====================
// File: src/shared/ui/atoms/icon.tsx
// Purpose:
// - SVG icon atom
// - Keep built-in icon registry minimal
// - Preserve ability to pass custom children
// =====================

import type {
    JSX,
    SVGProps,
} from 'react';

import { joinClassNames } from '../classNames';

const ICONS = {
    bell: (
        <>
            <path
                d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Z"
                fill="currentColor"
            />
            <path
                d="M18 16V11a6 6 0 1 0-12 0v5L4 18h16l-2-2Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </>
    ),
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps
    extends SVGProps<SVGSVGElement> {
    name?: IconName;
}

export function Icon({
                         name,
                         className,
                         children,
                         ...rest
                     }: IconProps): JSX.Element {
    const combinedClassName = joinClassNames(
        'ui-icon',
        className,
    );

    const hasExplicitLabel =
        rest['aria-label'] !== undefined ||
        rest['aria-labelledby'] !== undefined;

    return (
        <svg
            {...rest}
            className={combinedClassName}
            data-icon={name}
            viewBox="0 0 24 24"
            aria-hidden={
                hasExplicitLabel ? undefined : true
            }
            focusable="false"
        >
            {children ?? (name ? ICONS[name] : null)}
        </svg>
    );
}