// =====================
// shared/api/types.ts
// =====================

export type HttpMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS';

export interface HttpRequestHeaders {
    [header: string]: string;
}

/**
 * Значения query, которые HTTP-клиент умеет сериализовать:
 * - primitives
 * - arrays (repeat key)
 * - Date (toISOString)
 * - objects (JSON.stringify)
 */
export type HttpQueryPrimitive = string | number | boolean;

export type HttpQueryValue =
    | HttpQueryPrimitive
    | null
    | undefined
    | HttpQueryPrimitive[]
    | Date
    | Date[]
    | Record<string, unknown>
    | Array<Record<string, unknown>>;

/**
 * Query-тип как "shape по ключам", а не index-signature.
 * Это позволяет передавать DTO-интерфейсы без `[key: string]: ...`
 * (иначе TypeScript ругается: "Index signature is missing").
 */
export type HttpRequestQuery<TQuery extends object = Record<string, unknown>> = {
    [K in Extract<keyof TQuery, string>]?: HttpQueryValue;
};


export interface HttpRequestConfig<
    TBody = unknown,
    TQuery extends object = Record<string, unknown>,
> {
    method: HttpMethod;
    url: string;
    baseUrl?: string;
    headers?: HttpRequestHeaders;
    query?: HttpRequestQuery<TQuery>;
    body?: TBody;
    signal?: AbortSignal;
    timeoutMs?: number;
    withCredentials?: boolean;
}

export interface HttpResponse<TData = unknown> {
    status: number;
    headers: HttpRequestHeaders;
    data: TData;
}

export interface ApiListRequest {
    page: number;
    pageSize: number;
}

export interface ApiListMeta {
    total: number;
    page: number;
    pageSize: number;
}

