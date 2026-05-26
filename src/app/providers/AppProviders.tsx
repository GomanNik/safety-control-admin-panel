// =====================
// src/app/providers/AppProviders.tsx
// =====================

import type { JSX, ReactNode } from 'react';

import { RootProviders } from './createProviders';

export interface AppProvidersProps {
    children: ReactNode;
}

export function AppProviders({
                                 children,
                             }: AppProvidersProps): JSX.Element {
    return (
        <RootProviders>
            {children}
        </RootProviders>
    );
}