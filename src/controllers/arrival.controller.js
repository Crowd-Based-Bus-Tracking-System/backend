import { ArrivalReportRequestSchema } from "../DTOs/arrival-request.js"
import { reportArrival, getReports, upvoteReport } from "../services/arrival.service.js";


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

export const getRecentReports = async (req, res) => {
    try {
        const busId = req.params.busId;
        const reports = await getReports(busId);
        return res.status(200).json({ success: true, reports });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const upvoteArrivalReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { routeId } = req.body;

        if (!routeId) return res.status(400).json({ success: false, message: "routeId is required" });

        const result = await upvoteReport(reportId, routeId);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}