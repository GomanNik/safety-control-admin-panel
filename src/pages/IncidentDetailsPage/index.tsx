// =====================
// src/pages/IncidentDetailsPage/index.tsx
// =====================

import type { JSX } from 'react';
import {
    Navigate,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { IncidentDetailsWidget } from '../../widgets';

interface IncidentDetailsLocationState {
    from?: string;
}

function resolveBackPath(
    value: unknown,
): string {
    if (typeof value !== 'string') {
        return '/incidents';
    }

    const normalized = value.trim();

    if (!normalized.startsWith('/')) {
        return '/incidents';
    }

    if (normalized === '/incidents') {
        return normalized;
    }

    return '/incidents';
}

export function IncidentDetailsPage(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();
    const { incidentId } = useParams<{ incidentId: string }>();

    if (!incidentId) {
        return <Navigate to="/incidents" replace />;
    }

    const locationState = location.state as IncidentDetailsLocationState | null;
    const backPath = resolveBackPath(locationState?.from);

    return (
        <AppLayout>
            <IncidentDetailsWidget
                incidentId={incidentId}
                showBackButton
                onBack={() => {
                    navigate(backPath);
                }}
            />
        </AppLayout>
    );
}