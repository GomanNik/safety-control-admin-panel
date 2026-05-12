// =====================
// shared/api/client-factory.ts
// =====================

import type { HttpClient } from './http-client';
import { getGlobalLogger } from '../logging';

const logger = getGlobalLogger().child('shared').child('api').child('client-factory');

/**
 * NOTE:
 * basePath — это "корневой путь ресурса" (например, "/incidents"),
 * НЕ baseUrl HttpClient'а (он задаётся в configured-client/http-client).
 */
export interface ApiClientContext {
    httpClient: HttpClient;
    basePath: string;
}

export type ApiClientFactory<TClient> = (ctx: ApiClientContext) => TClient;

/**
 * Базовый хелпер для создания REST-клиентов домена.
 * Делает минимальную валидацию контекста и просто делегирует фабрике.
 */
export const createRestResourceClient = <TClient,>(
    ctx: ApiClientContext,
    factory: ApiClientFactory<TClient>,
): TClient => {
    if (!ctx) {
        logger.error('ApiClientContext is required');
        throw new Error('ApiClientContext is required');
    }
    if (!ctx.httpClient) {
        logger.error('ApiClientContext.httpClient is required');
        throw new Error('ApiClientContext.httpClient is required');
    }
    if (!ctx.basePath) {
        logger.error('ApiClientContext.basePath is required');
        throw new Error('ApiClientContext.basePath is required');
    }

    logger.debug('Creating REST resource client', {
        basePath: ctx.basePath,
        factoryName: factory?.name || 'anonymous',
    });

    const client = factory(ctx);
    if (!client) {
        logger.error('Api client factory returned empty client', {
            basePath: ctx.basePath,
            factoryName: factory?.name || 'anonymous',
        });
        throw new Error('Api client factory returned empty client');
    }

    logger.debug('REST resource client created', {
        basePath: ctx.basePath,
        factoryName: factory?.name || 'anonymous',
    });

    return client;
};
