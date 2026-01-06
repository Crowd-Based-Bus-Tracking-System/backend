import { trainArrivalModelIntergrate } from "../services/ml-arrival-confirmation/mlArrivalIntegration.service.js";

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