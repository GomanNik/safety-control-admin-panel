// =====================
// src/app/mocks/index.ts
// =====================

import { worker } from './browser';

const STATIC_ASSET_PATTERN =
    /\.(png|jpg|jpeg|svg|gif|webp|ico|mp4|webm|m3u8|ts|css|js|map|woff|woff2|html)$/i;

const STATIC_PREFIXES = [
    '/favicon',
    '/videos/',
    '/images/',
    '/assets/',
    '/@vite/',
    '/@fs/',
    '/node_modules/',
    '/src/',
] as const;

export async function startMocking(): Promise<void> {
    await worker.start({
        onUnhandledRequest(request, print) {
            const url = new URL(request.url);
            const pathname = url.pathname;
            const accept = request.headers.get('accept') ?? '';

            const isStaticAssetRequest =
                request.method === 'GET' &&
                (
                    STATIC_ASSET_PATTERN.test(pathname) ||
                    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
                );

            const isDocumentRequest =
                request.method === 'GET' &&
                (
                    request.mode === 'navigate' ||
                    request.destination === 'document' ||
                    accept.includes('text/html')
                );

            if (isStaticAssetRequest || isDocumentRequest) {
                return;
            }

            print.warning();
        },
    });
}