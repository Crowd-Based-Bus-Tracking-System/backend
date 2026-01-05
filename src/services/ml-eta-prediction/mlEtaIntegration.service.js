import buildETAFeatures from "./etaFeatureBuilder.service.js";
import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

/**
 * Predict ETA using ML model
 * @param {Object} params
 * @param {number} params.busId
 * @param {number} params.targetStopId
 * @param {Object} params.location - {lat, lng}
 * @returns {Object} Prediction result
 */
export const predictETAWithML = async ({ busId, targetStopId, location }) => {
    try {
        const requestTime = Date.now();

        // Build features
        const features = await buildETAFeatures({
            busId,
            targetStopId,
            requestTime,
            location
        });

        console.log(`Built ${Object.keys(features).length} features for ETA prediction`);

        // Call ML service
        const response = await axios.post(`${ML_SERVICE_URL}/predict-eta`, features, {
            timeout: 5000
        });

        return {
            mlPrediction: response.data.eta_seconds,
            confidence: response.data.confidence,
            uncertaintyRange: response.data.uncertainty_range,
            features: features,
            method: "ml_prediction"
        };

    } catch (error) {
        console.error("Error predicting ETA with ML:", error.message);

        // Return null on error (fallback to baseline methods)
        return {
            mlPrediction: null,
            confidence: 0,
            uncertaintyRange: null,
            features: null,
            method: "ml_error",
            error: error.message
        };
    }
};

/**
 * Store ETA prediction for training/evaluation
 * @param {Object} predictionData
 */
export const storePredictionForTraining = async (predictionData) => {
    try {
        const response = await axios.post(
            `${ML_SERVICE_URL}/store-eta-prediction`,
            predictionData,
            { timeout: 3000 }
        );

        console.log("ETA prediction stored for training");
        return response.data;

    } catch (error) {
        console.error("Error storing prediction:", error.message);
        return null;
    }
};

/**
 * Log prediction accuracy when bus actually arrives
 * @param {number} busId
 * @param {number} stopId
 * @param {number} actualArrivalTime
 * @param {Object} prediction - Original prediction object
 */
export const logPredictionAccuracy = async (busId, stopId, actualArrivalTime, prediction) => {
    if (!prediction || !prediction.features) {
        return;
    }

    const predictionMadeAt = prediction.features.prediction_made_at;
    const actualETA = (actualArrivalTime - predictionMadeAt) / 1000; // seconds
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

    // Flag anomalous predictions (>5 min error)
    if (absError > 300) {
        console.warn(`⚠️ Large ETA prediction error: ${absError}s for bus ${busId} at stop ${stopId}`);
    }
};
