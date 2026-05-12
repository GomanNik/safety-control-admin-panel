// =====================
// File: backend/src/modules/site/routes.ts
// Purpose:
// - Express routes for site module
// - Uses shared async/validation/http helpers
// - Assumes app-level shared error middleware is mounted in backend/src/app.ts
// =====================

import { Router } from 'express';

import {
    asyncHandler,
    parseWithSchema,
    sendNoContent,
} from '../../shared/http';

import {
    siteCreateSchema,
    siteIdParamsSchema,
    siteListQuerySchema,
    sitePatchSchema,
} from './schemas';
import {
    createSite,
    deleteSite,
    getSiteById,
    getSiteList,
    getSiteMetrics,
    patchSite,
} from './service';

const siteRouter = Router();

siteRouter.get(
    '/metrics',
    asyncHandler(async (req, res) => {
        const query = parseWithSchema(
            siteListQuerySchema,
            req.query,
        );

        const result = await getSiteMetrics(query);
        res.json(result);
    }),
);

siteRouter.get(
    '/',
    asyncHandler(async (req, res) => {
        const query = parseWithSchema(
            siteListQuerySchema,
            req.query,
        );

        const result = await getSiteList(query);
        res.json(result);
    }),
);

siteRouter.post(
    '/',
    asyncHandler(async (req, res) => {
        const body = parseWithSchema(
            siteCreateSchema,
            req.body,
        );

        const result = await createSite(body);
        res.status(201).json(result);
    }),
);

siteRouter.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const params = parseWithSchema(
            siteIdParamsSchema,
            req.params,
        );

        const result = await getSiteById(params.id);
        res.json(result);
    }),
);

siteRouter.patch(
    '/:id',
    asyncHandler(async (req, res) => {
        const params = parseWithSchema(
            siteIdParamsSchema,
            req.params,
        );

        const body = parseWithSchema(
            sitePatchSchema,
            req.body,
        );

        const result = await patchSite(
            params.id,
            body,
        );

        res.json(result);
    }),
);

siteRouter.delete(
    '/:id',
    asyncHandler(async (req, res) => {
        const params = parseWithSchema(
            siteIdParamsSchema,
            req.params,
        );

        await deleteSite(params.id);
        sendNoContent(res);
    }),
);

export {
    siteRouter,
};

export default siteRouter;