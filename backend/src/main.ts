// =====================
// File: backend/src/main.ts
// Purpose:
// - Backend entrypoint
// - Starts HTTP server on frontend-aligned defaults
// - Adds graceful shutdown for server and PostgreSQL pool
// =====================

import http from 'node:http';

import app from './app';
import { env } from './config/env';
import { closePool } from './db/client';

const server = http.createServer(app);

let shutdownPromise: Promise<void> | null = null;

function getDisplayHost(): string {
    return env.host === '0.0.0.0'
        ? 'localhost'
        : env.host;
}

function logStartup(): void {
    console.info(
        `[backend] listening on http://${getDisplayHost()}:${env.port}${env.apiBasePath}`,
    );
}

async function shutdown(
    signal: NodeJS.Signals,
): Promise<void> {
    if (shutdownPromise) {
        return shutdownPromise;
    }

    shutdownPromise = new Promise<void>((resolve) => {
        console.info(`[backend] received ${signal}, shutting down...`);

        const forceExitTimer = setTimeout(() => {
            console.error(
                `[backend] graceful shutdown timeout exceeded (${env.shutdownTimeoutMs} ms)`,
            );
            process.exit(1);
        }, env.shutdownTimeoutMs);

        forceExitTimer.unref();

        server.close((serverError) => {
            void closePool()
                .then(() => {
                    clearTimeout(forceExitTimer);

                    if (serverError) {
                        console.error('[backend] server close error', serverError);
                        process.exit(1);
                        return;
                    }

                    console.info('[backend] shutdown complete');
                    process.exit(0);
                })
                .catch((closeError) => {
                    clearTimeout(forceExitTimer);
                    console.error('[backend] infrastructure shutdown error', closeError);
                    process.exit(1);
                })
                .finally(() => {
                    resolve();
                });
        });
    });

    return shutdownPromise;
}

server.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[backend] server error', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
    console.error('[backend] unhandled rejection', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[backend] uncaught exception', error);
    void shutdown('SIGTERM');
});

server.listen(env.port, env.host, logStartup);