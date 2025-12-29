import {  Router } from 'express';
import z, { parse } from 'zod';
import { query } from '../db.js';

const router = Router();

const searchSchema = z.object({
    startList: z.coerce.number().min(-90).max(90),
    startLng: z.coerce.number().min(-180).max(180),
    destList: z.coerce.number().min(-90).max(90),
    destLng: z.coerce.number().min(-180).max(180),
    radiusMeters: z.coerce.number().int().positive().max(5000).optional(),
});

const asyncHandler = (fn) => (req, res, next) => 
    Promise.resolve(fn(req, res, next)).catch(next);

router.get(
    "/search",
    asyncHandler(async (req, res) => {
        const parsed = searchSchema.safeParse(req.query);

        if(!parsed.success){
            return res.statu(400).json({
                error: "Invalid query params",
                details: parsed.error.flatten(),
            });
        }

        const { startList, startLang, destList, destLng } = parsed.data;
        const radiusMeters = parsed.data.radiusMeters ?? 800;

    })
)