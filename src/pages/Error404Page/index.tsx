// =====================
// src/pages/Error404Page/index.tsx
// =====================

import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { Error404Widget } from '../../widgets';

export function Error404Page(): JSX.Element {
    const navigate = useNavigate();

    return (
        <AppLayout>
            <Error404Widget
                onBack={() => navigate(-1)}
                onGoHome={() => navigate('/dashboard', { replace: true })}
            />
        </AppLayout>
    );
}