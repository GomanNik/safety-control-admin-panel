// =====================
// File: src/app/mocks/handlers.ts
// Purpose:
// - MSW routes for current app shell and mock REST API
// - Camera API now supports real creation flow:
//   - connection check
//   - create by verified token
//   - list / single camera
//   - live stream
//   - delete
// - Site delete is aligned with current frontend contract
//   and uses cascade cleanup in mock db
// =====================

import { http, HttpResponse } from 'msw';

import {
    createCamera,
    createCameraConnectionCheck,
    createSite,
    deleteCamera,
    deleteSite,
    getCameraById,
    getCameraVideoStream,
    getIncidentById,
    getIncidentMetrics,
    getMockDbSnapshot,
    getSiteById,
    getSiteMetrics,
    listCameras,
    listIncidents,
    listSites,
    patchSite,
    resetMockDb,
} from './db';

type QueryValue = string | string[] | undefined;
type QueryObject = Record<string, QueryValue>;

const toQueryObject = (url: URL): QueryObject => {
    const result: QueryObject = {};

    for (const key of new Set(url.searchParams.keys())) {
        const all = url.searchParams.getAll(key);
        result[key] = all.length <= 1 ? all[0] : all;
    }

    return result;
};

const notFound = (
    entity: string,
    id: string,
) => {
    return HttpResponse.json(
        {
            code: `${entity.toUpperCase()}_NOT_FOUND`,
            message: `${entity} "${id}" not found`,
        },
        { status: 404 },
    );
};

const conflict = (
    code: string,
    message: string,
) => {
    return HttpResponse.json(
        {
            code,
            message,
        },
        { status: 409 },
    );
};

const badRequest = (
    code: string,
    message: string,
    details?: unknown,
) => {
    return HttpResponse.json(
        {
            code,
            message,
            details,
        },
        { status: 400 },
    );
};

const serveAppShell = async () => {
    const response = await fetch('/index.html', {
        headers: {
            Accept: 'text/html',
        },
    });

    const html = await response.text();

    return new HttpResponse(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
        },
    });
};

const readJson = async <T,>(
    request: Request,
): Promise<T> => {
    return await request.json() as Promise<T>;
};

const isHtmlDocumentRequest = (
    request: Request,
): boolean => {
    const accept = request.headers.get('accept') ?? '';

    return (
        request.method === 'GET' &&
        (
            request.mode === 'navigate' ||
            request.destination === 'document' ||
            accept.includes('text/html')
        )
    );
};

export const handlers = [
    // =====================
    // app shell routes
    // =====================
    http.get('/', async () => {
        return await serveAppShell();
    }),

    http.get('/dashboard', async () => {
        return await serveAppShell();
    }),

    http.get('/settings', async () => {
        return await serveAppShell();
    }),

    http.get('/sites/create', async () => {
        return await serveAppShell();
    }),

    http.get('/sites/:id/edit', async () => {
        return await serveAppShell();
    }),

    // =====================
    // debug
    // =====================
    http.post('/__mock/reset', () => {
        resetMockDb();

        return HttpResponse.json({ ok: true });
    }),

    http.get('/__mock/state', () => {
        return HttpResponse.json(getMockDbSnapshot());
    }),

    // =====================
    // sites
    // =====================
    http.get('/sites/metrics', ({ request }) => {
        const query = toQueryObject(new URL(request.url));

        return HttpResponse.json(getSiteMetrics(query));
    }),

    http.post('/sites', async ({ request }) => {
        const payload = await readJson<Record<string, unknown>>(request);
        const item = createSite(payload as never);

        return HttpResponse.json(item, { status: 201 });
    }),

    http.get('/sites/:id', async ({ params, request }) => {
        if (isHtmlDocumentRequest(request)) {
            return await serveAppShell();
        }

        const id = String(params.id);
        const item = getSiteById(id);

        if (!item) {
            return notFound('site', id);
        }

        return HttpResponse.json(item);
    }),

    http.patch('/sites/:id', async ({ params, request }) => {
        const id = String(params.id);
        const payload = await readJson<Record<string, unknown>>(request);
        const item = patchSite(id, payload as never);

        if (!item) {
            return notFound('site', id);
        }

        return HttpResponse.json(item);
    }),

    http.delete('/sites/:id', ({ params }) => {
        const id = String(params.id);
        const result = deleteSite(id);

        if (!result.ok) {
            return notFound('site', id);
        }

        return new HttpResponse(null, { status: 204 });
    }),

    http.get('/sites', async ({ request }) => {
        if (isHtmlDocumentRequest(request)) {
            return await serveAppShell();
        }

        const query = toQueryObject(new URL(request.url));

        return HttpResponse.json(listSites(query));
    }),

    // =====================
    // cameras
    // =====================
    http.post('/cameras/connection-checks', async ({ request }) => {
        const payload = await readJson<Record<string, unknown>>(request);
        const result = createCameraConnectionCheck(payload as never);

        if (!result.ok) {
            const code = String(result.error?.code ?? result.status ?? 'connection_check_failed');
            const message = String(
                result.error?.message ??
                'Camera connection check failed',
            );

            return badRequest(
                code.toUpperCase(),
                message,
                result,
            );
        }

        return HttpResponse.json(result, { status: 201 });
    }),

    http.post('/cameras', async ({ request }) => {
        const payload = await readJson<Record<string, unknown>>(request);
        const result = createCamera(payload as never);

        if (!result.ok) {
            switch (result.reason) {
                case 'site_not_found':
                    return notFound('site', String(result.siteId ?? ''));

                case 'invalid_connection_check_token':
                    return badRequest(
                        'INVALID_CONNECTION_CHECK_TOKEN',
                        'Camera creation requires a valid connection_check_token',
                    );

                case 'expired_connection_check_token':
                    return badRequest(
                        'EXPIRED_CONNECTION_CHECK_TOKEN',
                        'The provided connection_check_token has expired',
                    );

                case 'connection_check_not_passed':
                    return badRequest(
                        'CONNECTION_CHECK_NOT_PASSED',
                        'Camera creation requires a successful connection check',
                    );

                case 'duplicate_source':
                    return conflict(
                        'CAMERA_SOURCE_ALREADY_BOUND',
                        'A camera with the same verified source is already attached',
                    );

                default:
                    return badRequest(
                        'CAMERA_CREATE_FAILED',
                        'Failed to create camera',
                    );
            }
        }

        return HttpResponse.json(result.camera, { status: 201 });
    }),

    http.get('/cameras/:id/video/stream', ({ params, request }) => {
        const id = String(params.id);
        const query = toQueryObject(new URL(request.url));
        const stream = getCameraVideoStream(id, query);

        if (!stream) {
            return notFound('camera', id);
        }

        return HttpResponse.json(stream);
    }),

    http.get('/cameras/:id', async ({ params, request }) => {
        if (isHtmlDocumentRequest(request)) {
            return await serveAppShell();
        }

        const id = String(params.id);
        const item = getCameraById(id);

        if (!item) {
            return notFound('camera', id);
        }

        return HttpResponse.json(item);
    }),

    http.delete('/cameras/:id', ({ params }) => {
        const id = String(params.id);
        const ok = deleteCamera(id);

        if (!ok) {
            return notFound('camera', id);
        }

        return new HttpResponse(null, { status: 204 });
    }),

    http.get('/cameras', async ({ request }) => {
        if (isHtmlDocumentRequest(request)) {
            return await serveAppShell();
        }

        const query = toQueryObject(new URL(request.url));

        return HttpResponse.json(listCameras(query));
    }),

    // =====================
    // incidents
    // =====================
    http.get('/incidents/metrics', ({ request }) => {
        const query = toQueryObject(new URL(request.url));

        return HttpResponse.json(getIncidentMetrics(query));
    }),

    http.get('/incidents/:id', async ({ params, request }) => {
        if (isHtmlDocumentRequest(request)) {
            return await serveAppShell();
        }

        const id = String(params.id);
        const item = getIncidentById(id);

        if (!item) {
            return notFound('incident', id);
        }

        return HttpResponse.json(item);
    }),

    http.get('/incidents', async ({ request }) => {
        if (isHtmlDocumentRequest(request)) {
            return await serveAppShell();
        }

        const query = toQueryObject(new URL(request.url));

        return HttpResponse.json(listIncidents(query));
    }),
];