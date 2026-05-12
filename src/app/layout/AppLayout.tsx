// =====================
// src/app/layout/AppLayout.tsx
// =====================

import type { JSX, ReactNode } from 'react';
import { joinClassNames } from '../../shared/ui/classNames';
import './app-layout.css';

export interface AppLayoutProps {
    children: ReactNode;
    className?: string;
}

export function AppLayout(props: AppLayoutProps): JSX.Element {
    const { children, className } = props;

    return (
        <div className={joinClassNames('app-layout', className)}>
            <main className="app-layout__content">{children}</main>
        </div>
    );
}

