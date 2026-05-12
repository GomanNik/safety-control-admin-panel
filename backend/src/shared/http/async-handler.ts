// =====================
// File: backend/src/shared/http/async-handler.ts
// Purpose:
// - Wraps async express handlers and forwards rejected promises to next()
// - Eliminates repetitive try/catch in route files
// =====================

import type {
    NextFunction,
    Request,
    RequestHandler,
    Response,
} from 'express';

type AsyncRequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(
    handler: AsyncRequestHandler,
): RequestHandler {
    return (req, res, next) => {
        void Promise.resolve(handler(req, res, next)).catch(next);
    };
}