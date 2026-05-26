// =====================
// src/app/App.tsx
// =====================

import type { JSX } from 'react';

import { AppErrorBoundaryWidget } from '../widgets';
import { AppRouter } from './router';

export function App(): JSX.Element {
    return (
        <AppErrorBoundaryWidget>
            <AppRouter />
        </AppErrorBoundaryWidget>
    );
}