// =====================
// File: src/pages/SiteDetailsPage/index.tsx
// Purpose:
// - Page wrapper for site details
// - Connects widget navigation to edit, close, delete, and camera details
// =====================

import type { JSX } from 'react';
import {
    Navigate,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { SiteDetailsWidget } from '../../widgets';

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

export function SiteDetailsPage(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams<{ siteId: string }>();

    const siteId = params.siteId ?? null;

    if (!siteId) {
        return <Navigate to="/dashboard" replace />;
    }

    const backPath = resolveFromPath(location.state, '/dashboard');

    return (
        <AppLayout>
            <SiteDetailsWidget
                siteId={siteId}
                onEditSite={(nextSiteId) => {
                    navigate(`/sites/${nextSiteId}/edit`, {
                        state: {
                            from: `/sites/${nextSiteId}`,
                        },
                    });
                }}
                onClose={() => {
                    navigate(backPath);
                }}
                onDeleted={() => {
                    navigate('/dashboard', {
                        replace: true,
                    });
                }}
                onOpenCameraDetails={(cameraId) => {
                    navigate(`/cameras/${cameraId}`, {
                        state: {
                            from: `/sites/${siteId}`,
                        },
                    });
                }}
            />
        </AppLayout>
    );
}