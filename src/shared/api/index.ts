// =====================
// shared/api/index.ts
// =====================

export * from './types';
export * from './errors';
export * from './http-client';
export * from './client-factory';
export * from './primitives';
export * from './configured-client';
export * from './react';

export type {
    HttpInterceptorManager,
    HttpRequestInterceptor,
    HttpResponseInterceptor,
    HttpErrorInterceptor,
} from './interceptors';
