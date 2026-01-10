import { predictETA, storeETAData, checkMLServiceHealth, trainETAModel } from "./index.js";
import buildETAFeatures from "./etaFeatureBuilder.service.js";


export const predictETAWithML = async ({ busId, targetStopId, location }) => {
    try {
        const isAvailable = await checkMLServiceHealth();
        if (!isAvailable) {
            console.warn("ML service unavailable, skipping ML ETA prediction");
            return { mlPrediction: null, confidence: 0, features: null };
        }

        const requestTime = Date.now();

        const features = await buildETAFeatures({
            busId,
            targetStopId,
            requestTime,
            location
        });

        console.log(`Built ${Object.keys(features).length} features for ETA prediction`);

        const prediction = await predictETA(features);

        console.log('ML ETA Prediction Response:', JSON.stringify(prediction, null, 2));

        return {
            mlPrediction: prediction.eta_seconds,
            confidence: prediction.confidence,
            etaMinutes: prediction.eta_minutes,
            features: features,
            method: "ml_prediction"
        };

    } catch (error) {
        console.error("Error in ML ETA prediction:", error.message);
        return {
            mlPrediction: null,
            confidence: 0,
            features: null,
            method: "ml_error",
            error: error.message
        };
    }
};


export const trainETAModelIntegrate = async () => {
    const isAvailable = await checkMLServiceHealth();
    if (!isAvailable) {
        console.warn("ML service unavailable for training");
        throw new Error("ML service unavailable");
    }

    const result = await trainETAModel();
    console.log("ETA model training completed:", result);

    return result;
};


export const storePredictionForTraining = async (features, actualETA = null) => {
    try {
        const data = {
            ...features,
            actual_eta_seconds: actualETA
        };

        await storeETAData(data);
        console.log(`ETA prediction stored for training${actualETA ? ` with actual ETA: ${actualETA}s` : ''}`);
    } catch (error) {
        console.error("Error storing ETA prediction for training:", error.message);
    }
};


export const logPredictionAccuracy = async (busId, stopId, actualArrivalTime, prediction) => {
    if (!prediction || !prediction.features) {
        return;
    }

    const predictionMadeAt = prediction.features.prediction_made_at;
    const actualETA = (actualArrivalTime - predictionMadeAt) / 1000;
    const predictedETA = prediction.mlPrediction;
    const error = actualETA - predictedETA;
    const absError = Math.abs(error);

    const trainingData = {
        ...prediction.features,
        actual_eta_seconds: actualETA,
        predicted_eta_seconds: predictedETA,
        error_seconds: error,
        abs_error_seconds: absError,
        actual_arrival_time: actualArrivalTime
    };

    await storePredictionForTraining(trainingData);

    console.log(`ETA Prediction accuracy logged: Predicted=${predictedETA}s, Actual=${actualETA}s, Error=${error}s`);

    if (absError > 300) {
        console.warn(` Large ETA prediction error: ${absError}s for bus ${busId} at stop ${stopId}`);
    }
};

