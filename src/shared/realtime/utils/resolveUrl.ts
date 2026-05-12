// =====================
// shared/realtime/utils/resolveUrl.ts
// =====================

import type { RealtimeClientConfig, RealtimeTransport } from '../types';

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.location !== 'undefined';
}

function joinPath(base: string, path: string): string {
    if (!base.endsWith('/') && !path.startsWith('/')) return `${base}/${path}`;
    if (base.endsWith('/') && path.startsWith('/')) return `${base}${path.slice(1)}`;
    return `${base}${path}`;
}

export function resolveEndpointUrl(rawUrl: string, transport: RealtimeTransport): string {
    const url = (rawUrl ?? '').trim();
    if (!url) return url;

    // Абсолютный ws/wss/http/https — отдаём как есть (ниже можем переписать схему)
    const isAbs =
        url.startsWith('ws://') ||
        url.startsWith('wss://') ||
        url.startsWith('http://') ||
        url.startsWith('https://');

    // Относительный URL: "/realtime" или "api/realtime"
    if (!isAbs) {
        if (!isBrowser()) return url;

        const origin = window.location.origin; // http(s)://host
        const absHttp = url.startsWith('/')
            ? joinPath(origin, url)
            : joinPath(origin, `/${url}`);

        if (transport === 'ws') {
            return absHttp.startsWith('https://')
                ? absHttp.replace(/^https:\/\//, 'wss://')
                : absHttp.replace(/^http:\/\//, 'ws://');
        }
        return absHttp;
    }

    // Абсолютный http(s), но transport=ws → конвертим схему
    if (transport === 'ws') {
        if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'wss://');
        if (url.startsWith('http://')) return url.replace(/^http:\/\//, 'ws://');
        // ws/wss уже ок
        return url;
    }

    // transport=sse → ожидаем http(s)
    if (url.startsWith('ws://')) return url.replace(/^ws:\/\//, 'http://');
    if (url.startsWith('wss://')) return url.replace(/^wss:\/\//, 'https://');
    return url;
}

export function resolveClientDialUrl(config: RealtimeClientConfig): string {
    return resolveEndpointUrl(config.url, config.transport);
}
