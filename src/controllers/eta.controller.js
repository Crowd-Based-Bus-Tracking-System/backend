import { ETAPredictionRequestSchema } from "../DTOs/eta-request.js";
import { ETAFusionEngine } from "../services/eta.service.js";

const etaFusionEngine = new ETAFusionEngine();

export const getETAPrediction = async (req, res) => {
    try {
        const data = ETAPredictionRequestSchema.parse(req.body);

        const etaResult = await etaFusionEngine.calculateFinalEta(data);

        return res.status(200).json({
            success: true,
            data: etaResult
        });

    } catch (error) {
        console.error("Error in getETAPrediction:", error.message);

        if (error.name === 'ZodError') {
            return res.status(400).json({
                success: false,
                message: "Invalid request data",
                errors: error.errors
            });
        }

        const statusCode = error.message.includes("not found") ? 404 : 500;

        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to calculate ETA"
        });
    }
};
