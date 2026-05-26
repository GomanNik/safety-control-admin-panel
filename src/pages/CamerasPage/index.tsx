// =====================
// src/pages/CamerasPage/index.tsx
// =====================

import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../../app/layout';
import { CamerasWorkspaceWidget } from '../../widgets';

export function CamerasPage(): JSX.Element {
    const navigate = useNavigate();

    return (
        <AppLayout>
            <CamerasWorkspaceWidget
                onOpenCameraDetails={(cameraId) => {
                    navigate(`/cameras/${cameraId}`, {
                        state: {
                            from: '/cameras',
                        },
                    });
                }}
            />
        </AppLayout>
    );
}