import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

export const predictArrival = async (features) => {
    try {
        console.log("Sending features to ML API:", JSON.stringify(features, null, 2));
        const response = await axios.post(`${ML_SERVICE_URL}/predict-arrival`, features);
        return response.data;
    } catch (error) {
        console.error("Error predicting arrival:", error.message);
        if (error.response?.data) {
            console.error("ML API validation error:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to predict arrival: ${error.message}`);
    }
};


export const trainArrivalModel = async () => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/train-arrival`);
        return response.data;
    } catch (error) {
        console.error("Error training model:", error.message);
        throw new Error(`Failed to train model: ${error.message}`);
    }
};


export const storeArrivalData = async (features, label) => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/store-arrival`, {
            ...features,
            label: label
        });
        return response.data;
    } catch (error) {
        console.error("Error storing arrival data:", error.message);
        throw new Error(`Failed to store arrival data: ${error.message}`);
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
