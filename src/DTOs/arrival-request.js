import { z } from "zod";


export const ArrivalReportRequestSchema = z.object({
    busId: z.number().int().positive(),
    stopId: z.number().int().positive(),
    arrivalTime: z.number(),
    user: z.object({
        id: z.string().min(1),
        lat: z.number(),
        lng: z.number()
    }),
    trafficLevel: z.enum(['Low', 'Medium', 'High', 'Severe']).optional(),
    eventNearby: z.boolean().optional()
});
