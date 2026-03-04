import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

export const predictOccupancy = async (features) => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/predict-occupancy`, features, {
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error("Error predicting occupancy:", error.message);
        throw new Error(`Failed to predict occupancy: ${error.message}`);
    }
};

export const trainOccupancyModel = async () => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/train-occupancy`);
        return response.data;
    } catch (error) {
        console.error("Error training occupancy model:", error.message);
        throw new Error(`Failed to train occupancy model: ${error.message}`);
    }
};

export const storeOccupancyData = async (features, label) => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/store-occupancy`, {
            ...features,
            label: label
        });
        return response.data;
    } catch (error) {
        console.error("Error storing occupancy data:", error.message);
        throw new Error(`Failed to store occupancy data: ${error.message}`);
    }
};

export const checkMLServiceHealth = async () => {
    try {
        await axios.get(`${ML_SERVICE_URL}/docs`, { timeout: 5000 });
        return true;
    } catch (error) {
        console.warn("ML service is not available:", error.message);
        return false;
    }
};
