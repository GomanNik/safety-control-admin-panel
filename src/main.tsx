// =====================
// src/main.tsx
// =====================

import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import { AppProviders } from './app/providers';
import { startMocking } from './app/mocks';

import './shared/foundation';
import './shared/theme/runtime.css';
import './shared/ui/styles/index.css';
import './app/styles/global.css';

async function bootstrap(): Promise<void> {
    await startMocking();

    const rootElement = document.getElementById('root');

    if (!rootElement) {
        throw new Error('Root container "#root" was not found.');
    }

    ReactDOM.createRoot(rootElement).render(
        <AppProviders>
            <App />
        </AppProviders>,
    );
}

void bootstrap();