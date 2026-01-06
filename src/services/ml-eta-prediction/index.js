import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";


export const predictETA = async (features) => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/predict-eta`, features, {
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error("Error predicting ETA:", error.message);
        throw new Error(`Failed to predict ETA: ${error.message}`);
    }
};


export const trainETAModel = async () => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/train-eta`);
        return response.data;
    } catch (error) {
        console.error("Error training ETA model:", error.message);
        throw new Error(`Failed to train ETA model: ${error.message}`);
    }
};


export const storeETAData = async (data) => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/store-eta`, data, {
            timeout: 3000
        });
        return response.data;
    } catch (error) {
        console.error("Error storing ETA data:", error.message);
        throw new Error(`Failed to store ETA data: ${error.message}`);
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
