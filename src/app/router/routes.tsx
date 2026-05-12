// =====================
// File: src/app/router/routes.tsx
// Purpose:
// - Application route map
// - Sites registry page is no longer a primary entry point
// - Site details/create/edit remain available by direct routes
// =====================

import type { JSX } from 'react';
import {
    Navigate,
    Route,
    Routes,
} from 'react-router-dom';

import { CameraDetailsPage } from '../../pages/CameraDetailsPage';
import { CamerasPage } from '../../pages/CamerasPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { Error404Page } from '../../pages/Error404Page';
import { IncidentDetailsPage } from '../../pages/IncidentDetailsPage';
import { IncidentsPage } from '../../pages/IncidentsPage';
import { SettingsPage } from '../../pages/SettingsPage';
import { SiteCreatePage } from '../../pages/SiteCreatePage';
import { SiteDetailsPage } from '../../pages/SiteDetailsPage';
import { SiteEditPage } from '../../pages/SiteEditPage';

export function AppRoutes(): JSX.Element {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/home" element={<Navigate to="/dashboard" replace />} />

            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/sites" element={<Navigate to="/dashboard" replace />} />
            <Route path="/sites/create" element={<SiteCreatePage />} />
            <Route path="/sites/:siteId/edit" element={<SiteEditPage />} />
            <Route path="/sites/:siteId" element={<SiteDetailsPage />} />

            <Route path="/cameras" element={<CamerasPage />} />
            <Route path="/cameras/:cameraId" element={<CameraDetailsPage />} />

            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/incidents/:incidentId" element={<IncidentDetailsPage />} />

            <Route path="/settings" element={<SettingsPage />} />

            <Route path="*" element={<Error404Page />} />
        </Routes>
    );
}