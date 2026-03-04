import { predictOccupancy, storeOccupancyData, checkMLServiceHealth, trainOccupancyModel } from "./index.js";
import buildOccupancyFeatures from "./occupancyFeatureBuilder.service.js";

export const validateOccupancyWithML = async (data, reportKey) => {
    try {
        const isAvailable = await checkMLServiceHealth();
        if (!isAvailable) {
            console.warn("ML service unavailable, skipping ML occupancy validation");
            return { mlConfirmed: null, probability: null, features: null };
        }

        const features = await buildOccupancyFeatures(data, reportKey);

        const prediction = await predictOccupancy(features);

        return {
            mlConfirmed: prediction.confirm,
            probability: prediction.confirm_probability,
            predictedLevel: prediction.predicted_level,
            features
        };
    } catch (error) {
        console.error("Error in ML occupancy validation:", error.message);
        return { mlConfirmed: null, probability: null, features: null };
    }
};

export const predictOccupancyWithML = async (data) => {
    try {
        const isAvailable = await checkMLServiceHealth();
        if (!isAvailable) {
            return { mlPrediction: null, confidence: 0 };
        }

        const features = await buildOccupancyFeatures(data, null);
        const prediction = await predictOccupancy(features);

        return {
            mlPrediction: prediction.predicted_level,
            confidence: prediction.confidence || 0.5,
            features
        };
    } catch (error) {
        console.error("Error in ML occupancy prediction:", error.message);
        return { mlPrediction: null, confidence: 0 };
    }
};

export const trainOccupancyModelIntegrate = async () => {
    const isAvailable = await checkMLServiceHealth();
    if (!isAvailable) {
        console.warn("ML service unavailable for occupancy training");
        throw new Error("ML service unavailable");
    }

    const result = await trainOccupancyModel();
    console.log("Occupancy model training completed:", result);
    return result;
};

export const storeOccupancyForTraining = async (features, probability = null, wasConfirmed = false) => {
    try {
        const label = probability !== null ? probability : (wasConfirmed ? 1 : 0);
        await storeOccupancyData(features, label);
        console.log(`Occupancy data stored for training with label: ${label}`);
    } catch (error) {
        console.error("Error storing occupancy data for training:", error.message);
    }
};
