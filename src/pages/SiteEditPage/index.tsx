// =====================
// File: src/pages/SiteEditPage/index.tsx
// Purpose:
// - Page wrapper for cleaned site edit flow
// - Returns to site details or dashboard when no source route is provided
// =====================

import type { JSX } from 'react';
import {
    Navigate,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { SiteEditWidget } from '../../widgets';

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

export function SiteEditPage(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams<{ siteId: string }>();

    const siteId = params.siteId ?? null;

    if (!siteId) {
        return <Navigate to="/dashboard" replace />;
    }

    const backPath = resolveFromPath(
        location.state,
        `/sites/${siteId}`,
    );

    return (
        <AppLayout>
            <SiteEditWidget
                siteId={siteId}
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