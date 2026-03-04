import { reportOccupancy, getCurrentOccupancy, getOccupancyReports } from "../services/occupancy.service.js";
import { OccupancyPredictionEngine } from "../services/occupancyPrediction.service.js";

const occupancyPredictionEngine = new OccupancyPredictionEngine();

export const ReportOccupancy = async (req, res) => {
    try {
        const data = req.body;
        const result = await reportOccupancy(data);

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
};

export const GetCurrentOccupancy = async (req, res) => {
    try {
        const { busId } = req.params;
        const occupancy = await getCurrentOccupancy(busId);

        if (!occupancy) {
            return res.status(200).json({
                success: true,
                occupancy: null,
                message: "No current occupancy data available"
            });
        }

        return res.status(200).json({
            success: true,
            occupancy
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const PredictOccupancy = async (req, res) => {
    try {
        const { busId, stopId } = req.params;
        const { routeId } = req.query;

        const prediction = await occupancyPredictionEngine.predictOccupancy({
            busId: parseInt(busId),
            stopId: parseInt(stopId),
            routeId: routeId ? parseInt(routeId) : null,
            location: req.body?.location || null
        });

        return res.status(200).json({
            success: true,
            prediction
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const GetOccupancyReports = async (req, res) => {
    try {
        const { busId } = req.params;
        const reports = await getOccupancyReports(busId);

        return res.status(200).json({
            success: true,
            reports
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
