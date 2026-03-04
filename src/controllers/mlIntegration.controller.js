import { trainArrivalModelIntergrate } from "../services/ml-arrival-confirmation/mlArrivalIntegration.service.js";
import { trainETAModelIntegrate } from "../services/ml-eta-prediction/mlEtaIntegration.service.js";
import { trainOccupancyModelIntegrate } from "../services/ml-occupancy-prediction/mlOccupancyIntegration.service.js";

export const trainArrivalModelController = async (req, res) => {
    try {
        const result = await trainArrivalModelIntergrate();
        return res.status(200).json({
            success: true,
            message: "Model trained successfully",
            metrics: result
        });
    } catch (error) {
        console.error("Error in trainArrivalModelController:", error.message);

        const statusCode = error.message.includes("unavailable") ? 503 : 500;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
}

export const trainOccupancyModelController = async (req, res) => {
    try {
        const result = await trainOccupancyModelIntegrate();
        return res.status(200).json({
            success: true,
            message: "Occupancy model trained successfully",
            metrics: result
        });
    } catch (error) {
        console.error("Error in trainOccupancyModelController:", error.message);

        const statusCode = error.message.includes("unavailable") ? 503 : 500;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
}

export const trainETAModelController = async (req, res) => {
    try {
        const result = await trainETAModelIntegrate();
        return res.status(200).json({
            success: true,
            message: "ETA model trained successfully",
            metrics: result
        });
    } catch (error) {
        console.error("Error in trainETAModelController:", error.message);

        const statusCode = error.message.includes("unavailable") ? 503 : 500;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
}