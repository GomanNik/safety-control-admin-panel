// =====================
// File: backend/src/app.ts
// Purpose:
// - Express application bootstrap for backend
// - Mounts implemented API modules under frontend-compatible /api base path
// - Uses shared backend HTTP/error foundation consistently
// =====================

import cors from 'cors';
import express, {
    type Express,
    type Request,
    type Response,
} from 'express';

import { env } from './config/env';
import siteRouter from './modules/site/routes';
import { forbidden } from './shared/errors';
import {
    errorHandler,
    notFoundHandler,
} from './shared/http';

const SERVICE_NAME = 'safety-control-backend';

function joinUrlPath(
    left: string,
    right: string,
): string {
    const combined = `${left}/${right}`.replace(/\/{2,}/g, '/');

    if (combined.length > 1 && combined.endsWith('/')) {
        return combined.slice(0, -1);
    }

    return combined;
}

function createCorsOriginDelegate(): cors.CorsOptions['origin'] {
    if (env.corsOrigins.length === 0 || env.corsOrigins.includes('*')) {
        return true;
    }

    return (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }

        if (env.corsOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(forbidden(
            'CORS_FORBIDDEN',
            'CORS origin is not allowed',
            { origin },
        ));
    };
}

export function createApp(): Express {
    const app = express();

    app.disable('x-powered-by');

    const corsMiddleware = cors({
        origin: createCorsOriginDelegate(),
        credentials: true,
    });

    app.use(corsMiddleware);
    app.options('*', corsMiddleware);

    app.use(express.json({
        limit: env.jsonBodyLimit,
    }));

    app.use(express.urlencoded({
        extended: true,
        limit: env.jsonBodyLimit,
    }));

    app.get('/', (_req: Request, res: Response) => {
        res.json({
            ok: true,
            service: SERVICE_NAME,
            env: env.appEnv,
            apiBasePath: env.apiBasePath,
            realtimeEnabled: env.realtimeEnabled,
            realtimePath: env.realtimePath,
        });
    });

    app.get(
        joinUrlPath(env.apiBasePath, 'health'),
        (_req: Request, res: Response) => {
            res.json({
                ok: true,
                status: 'healthy',
                service: SERVICE_NAME,
                env: env.appEnv,
            });
        },
    );

    if (env.realtimeEnabled) {
        app.get(env.realtimePath, (_req: Request, res: Response) => {
            res.status(426).json({
                code: 'UPGRADE_REQUIRED',
                message: 'Use WebSocket upgrade for realtime endpoint',
            });
        });
    }

    app.use(
        joinUrlPath(env.apiBasePath, 'sites'),
        siteRouter,
    );

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

export const app = createApp();

export default app;