// =====================
// File: src/pages/DashboardPage/index.tsx
// Purpose:
// - Dashboard page
// - Site navigation starts from dashboard cards
// - Site create action is available from dashboard cameras section
// =====================

import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { DashboardWorkspaceWidget } from '../../widgets';

export function DashboardPage(): JSX.Element {
    const navigate = useNavigate();

    return (
        <AppLayout>
            <DashboardWorkspaceWidget
                onOpenSiteDetails={(siteId) => {
                    navigate(`/sites/${siteId}`, {
                        state: {
                            from: '/dashboard',
                        },
                    });
                }}
                onCreateSite={() => {
                    navigate('/sites/create', {
                        state: {
                            from: '/dashboard',
                        },
                    });
                }}
            />
        </AppLayout>
    );
}