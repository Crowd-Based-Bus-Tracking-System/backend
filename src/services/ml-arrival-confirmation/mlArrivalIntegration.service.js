import { predictArrival, storeArrivalData, checkMLServiceHealth, trainArrivalModel } from "./index.js";
import buildFeatures from "./arrivalFeautreBuilder.service.js";


export const validateArrivalWithML = async (data, reportKey) => {
    try {
        const isAvailable = await checkMLServiceHealth();
        if (!isAvailable) {
            console.warn("ML service unavailable, skipping ML validation");
            return { mlConfirmed: null, probability: null, features: null };
        }

        const features = await buildFeatures(data, reportKey);

        const prediction = await predictArrival(features);

        return {
            mlConfirmed: prediction.confirm,
            probability: prediction.confirm_probability,
            features: features
        };
    } catch (error) {
        console.error("Error in ML validation:", error.message);
        return { mlConfirmed: null, probability: null, features: null };
    }
};


export const trainArrivalModelIntergrate = async () => {
    const isAvailable = await checkMLServiceHealth();
    if (!isAvailable) {
        console.warn("ML service unavailable for training");
        throw new Error("ML service unavailable");
    }

    const result = await trainArrivalModel();
    console.log("Model training completed:", result);

    return result;
}


export const storeArrivalForTraining = async (features, probability = null, wasConfirmed = false) => {
    try {
        const label = probability !== null ? probability : (wasConfirmed ? 1 : 0);
        await storeArrivalData(features, label);
        console.log(`Arrival data stored for training with label: ${label}`);
    } catch (error) {
        console.error("Error storing arrival data for training:", error.message);
    }
};
