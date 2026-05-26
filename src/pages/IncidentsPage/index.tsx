// =====================
// src/pages/IncidentsPage/index.tsx
// =====================

import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { IncidentsWorkspaceWidget } from '../../widgets';

export function IncidentsPage(): JSX.Element {
    const navigate = useNavigate();

    return (
        <AppLayout>
            <IncidentsWorkspaceWidget
                onOpenIncident={(incidentId) => {
                    navigate(`/incidents/${incidentId}`, {
                        state: {
                            from: '/incidents',
                        },
                    });
                }}
            />
        </AppLayout>
    );
}