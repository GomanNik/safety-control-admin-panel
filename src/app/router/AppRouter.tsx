// =====================
// src/app/router/AppRouter.tsx
// =====================

import type { JSX } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './routes';

export function AppRouter(): JSX.Element {
    return (
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    );
}