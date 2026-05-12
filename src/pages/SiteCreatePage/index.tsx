// =====================
// File: src/pages/SiteCreatePage/index.tsx
// Purpose:
// - Page wrapper for cleaned site create flow
// - Returns to dashboard when there is no explicit source route
// =====================

import type { JSX } from 'react';
import {
    useLocation,
    useNavigate,
} from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { SiteCreateWidget } from '../../widgets';

type RouteState = {
    from?: string;
};

function resolveFromPath(
    state: unknown,
    fallback: string,
): string {
    const candidate = state as RouteState | null | undefined;
    const from = candidate?.from;

    if (typeof from === 'string' && from.trim().length > 0) {
        return from;
    }

    return fallback;
}

export function SiteCreatePage(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();

    const backPath = resolveFromPath(location.state, '/dashboard');

    return (
        <AppLayout>
            <SiteCreateWidget
                onSaved={(site) => {
                    navigate(`/sites/${site.id}`, {
                        replace: true,
                        state: {
                            from: backPath,
                        },
                    });
                }}
                onCancel={() => {
                    navigate(backPath);
                }}
            />
        </AppLayout>
    );
}