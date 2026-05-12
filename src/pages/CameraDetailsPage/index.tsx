// =====================
// src/pages/CameraDetailsPage/index.tsx
// =====================

import type { JSX } from 'react';
import {
    useLocation,
    useNavigate,
    useParams,
} from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { CameraDetailsWidget } from '../../widgets';

type CameraDetailsPageLocationState = {
    from?: string;
};

export function CameraDetailsPage(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();
    const { cameraId } = useParams<{ cameraId: string }>();

    const locationState = location.state as CameraDetailsPageLocationState | null;
    const backPath = locationState?.from ?? '/cameras';

    return (
        <AppLayout>
            <CameraDetailsWidget
                cameraId={cameraId}
                showBackButton
                onBack={() => {
                    navigate(backPath);
                }}
            />
        </AppLayout>
    );
}