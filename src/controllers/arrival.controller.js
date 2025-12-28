import { ArrivalReportRequestSchema } from "../DTOs/arrival-request.js"
import { reportArrival } from "../services/arrival.service.js";


export const ReportArrival = async (req, res) => {
    try {
        const data = ArrivalReportRequestSchema.parse(req.body);
        const result = await reportArrival(data);

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}