import redis from "../config/redis.js";
import { getAverageOccupancyByHourAndStop, getAverageOccupancyByRoute, getRecentOccupancyForBus } from "../models/occupancy.js";
import { predictOccupancyWithML } from "./ml-occupancy-prediction/mlOccupancyIntegration.service.js";
import { getCurrentOccupancy } from "./occupancy.service.js";

class OccupancyPredictionEngine {
    async predictOccupancy(data) {
        const { busId, stopId, routeId, location } = data;

        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();

        const currentOccupancy = await getCurrentOccupancy(busId);
        if (currentOccupancy && (Date.now() - currentOccupancy.confirmedAt) < 600000) {
            return {
                occupancy_level: currentOccupancy.level,
                confidence: 0.95,
                method: "real_time",
                methods_used: [{ method: "real_time", level: currentOccupancy.level, weight: 1.0 }]
            };
        }

        const historicalAvg = await getAverageOccupancyByHourAndStop(stopId, hour, dayOfWeek);
        const historicalLevel = historicalAvg?.avg_occupancy ? Math.round(parseFloat(historicalAvg.avg_occupancy)) : null;
        const historicalSamples = parseInt(historicalAvg?.sample_count || 0);
        const recentOccupancy = await getRecentOccupancyForBus(busId, 120);
        const recentLevel = recentOccupancy.length > 0 ? recentOccupancy[0].occupancy_level : null;

        const routeAvg = await getAverageOccupancyByRoute(busId, hour);
        const routeLevel = routeAvg?.avg_occupancy ? Math.round(parseFloat(routeAvg.avg_occupancy)) : null;

        const mlResult = await predictOccupancyWithML({
            bus: { busId, routeId },
            stopId,
            location,
            hourOfDay: hour,
            dayOfWeek
        });

        const weights = this.calculateWeights(recentLevel, historicalSamples, mlResult);

        let finalLevel = 0;
        const methods = [];

        if (recentLevel !== null && weights.recent > 0) {
            finalLevel += recentLevel * weights.recent;
            methods.push({ method: "recent", level: recentLevel, weight: weights.recent });
        }

        if (historicalLevel !== null && weights.historical > 0) {
            finalLevel += historicalLevel * weights.historical;
            methods.push({ method: "historical", level: historicalLevel, weight: weights.historical });
        }

        if (routeLevel !== null && weights.route > 0) {
            finalLevel += routeLevel * weights.route;
            methods.push({ method: "route_avg", level: routeLevel, weight: weights.route });
        }

        if (mlResult.mlPrediction !== null && weights.ml > 0) {
            finalLevel += mlResult.mlPrediction * weights.ml;
            methods.push({ method: "ml", level: mlResult.mlPrediction, weight: weights.ml, ml_confidence: mlResult.confidence });
        }

        if (methods.length === 0) {
            finalLevel = 3;
            methods.push({ method: "default", level: 3, weight: 1.0 });
        }

        const roundedLevel = Math.max(1, Math.min(5, Math.round(finalLevel)));
        const confidence = this.calculateOverallConfidence(weights, mlResult, historicalSamples, recentLevel);

        try {
            const predKey = `occupancy_prediction:${busId}:${stopId}`;
            await redis.hset(predKey, {
                level: String(roundedLevel),
                confidence: String(confidence),
                updated_at: new Date().toISOString()
            });
            await redis.expire(predKey, 300);
        } catch (e) {
            console.warn("Occupancy prediction cache error:", e.message);
        }

        return {
            occupancy_level: roundedLevel,
            occupancy_label: this.levelToLabel(roundedLevel),
            confidence,
            methods_used: methods,
            weights
        };
    }

    calculateWeights(recentLevel, historicalSamples, mlResult) {
        const weights = { recent: 0, historical: 0, route: 0, ml: 0 };

        if (recentLevel !== null) {
            weights.recent = 0.4;
            weights.historical = 0.2;
            weights.route = 0.1;
            weights.ml = 0.3;
        } else if (historicalSamples > 10) {
            weights.recent = 0;
            weights.historical = 0.4;
            weights.route = 0.2;
            weights.ml = 0.4;
        } else {
            weights.recent = 0;
            weights.historical = 0.2;
            weights.route = 0.3;
            weights.ml = 0.5;
        }

        if (mlResult.mlPrediction === null) {
            const mlShare = weights.ml;
            weights.ml = 0;
            weights.historical += mlShare * 0.6;
            weights.route += mlShare * 0.4;
        }

        return this.normalizeWeights(weights);
    }

    calculateOverallConfidence(weights, mlResult, historicalSamples, recentLevel) {
        let confidence = 0.3; // Base

        if (recentLevel !== null) confidence += 0.3;
        if (historicalSamples > 10) confidence += 0.2;
        if (mlResult.mlPrediction !== null) confidence += mlResult.confidence * 0.2;

        return Math.max(0, Math.min(1, confidence));
    }

    normalizeWeights(weights) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        if (sum === 0) return { recent: 0, historical: 0.5, route: 0.5, ml: 0 };
        return Object.fromEntries(
            Object.entries(weights).map(([k, v]) => [k, v / sum])
        );
    }

    levelToLabel(level) {
        const labels = { 1: "EMPTY", 2: "LOW", 3: "MODERATE", 4: "HIGH", 5: "FULL" };
        return labels[level] || "UNKNOWN";
    }
}

export { OccupancyPredictionEngine };
