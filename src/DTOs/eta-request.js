import { z } from "zod";


export const ETAPredictionRequestSchema = z.object({
    bus: z.object({
        busId: z.number().int().positive(),
        routeId: z.number().int().positive(),
    }),
    targetStopId: z.number().int().positive(),
    location: z.object({
        lat: z.number(),
        lng: z.number()
    }).optional()
});
