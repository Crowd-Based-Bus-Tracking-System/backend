import redis from "../config/redis.js";
import BusProgressionService from "./busProgression.service.js";
import { getSegmentTimes } from "../models/segments.js";
import { getScheduleForStop } from "../models/shedule.js";
import { calculateSegmentTimeFromArrivals } from "../models/arrival.js";
import { predictETAWithML } from "./ml-eta-prediction/mlEtaIntegration.service.js";

class BaseEtaService {
    constructor() {
        this.busProgressionService = new BusProgressionService();
    }

    getNextScheduledTime(schedule) {
        if (!schedule) return null;

        const now = new Date();
        const [hours, minutes, seconds] = schedule.sheduled_arrival_time.split(':').map(Number);

        const scheduledTime = new Date();
        scheduledTime.setHours(hours, minutes, seconds || 0, 0);

        if (scheduledTime < now) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        return scheduledTime.getTime();
    }

    getScheduledTime(schedule) {
        if (!schedule) return null;

        const now = new Date();
        const [hours, minutes, seconds] = schedule.sheduled_arrival_time.split(':').map(Number);

        const scheduledTime = new Date();
        scheduledTime.setHours(hours, minutes, seconds || 0, 0);

        return scheduledTime.getTime();
    }

    calculateConfidence(minutesSinceLastArrival) {
        if (minutesSinceLastArrival < 5) return 0.9;
        if (minutesSinceLastArrival < 10) return 0.7;
        if (minutesSinceLastArrival < 20) return 0.5;
        if (minutesSinceLastArrival < 30) return 0.3;
        return 0.1;
    }

    async calculateScheduleBasedETA(busId, targetStopId) {
        const lastConfirmedStop = await this.busProgressionService.getLastConfirmedStop(busId);
        const schedule = await getScheduleForStop(busId, targetStopId);

        if (!schedule) {
            return { eta_seconds: null, method: "no_schedule" };
        }

        const now = Date.now();
        const scheduledTime = this.getNextScheduledTime(schedule);
        const scheduledETA = (scheduledTime - now) / 1000;

        if (!lastConfirmedStop) {
            return {
                eta_seconds: Math.max(0, scheduledETA),
                method: "schedule_only",
                confidence: 0.2
            };
        }

        const lastStopSchedule = await getScheduleForStop(busId, lastConfirmedStop.stopId);
        const currentDelay = lastConfirmedStop.arrivedAt - this.getScheduledTime(lastStopSchedule);

        const eta_seconds = Math.max(0, (scheduledETA + currentDelay / 1000));

        return {
            eta_seconds,
            method: "schedule_with_delay",
            current_delay_seconds: currentDelay / 1000,
            confidence: 0.4
        }
    }

    async calculateHistoricalETA(busId, targetStopId) {
        const lastConfirmedStop = await this.busProgressionService.getLastConfirmedStop(busId);

        if (!lastConfirmedStop) {
            return { eta_seconds: null, method: "no_tracking_data" };
        }

        const remainingStops = await this.busProgressionService.getRemainingStops(
            busId,
            targetStopId
        );

        if (remainingStops.length === 0) {
            return { eta_seconds: 0, method: "already_passed" };
        }

        let totalTime = 0;
        let fromStopId = lastConfirmedStop.stopId;

        for (const stop of remainingStops) {
            const segmentTime = await this.getSegmentTime(fromStopId, stop.id);
            totalTime += segmentTime;
            fromStopId = stop.id;
        }

        const timeSinceLastArrival = (Date.now() - lastConfirmedStop.arrivedAt) / 1000;
        const eta_seconds = Math.max(0, totalTime - timeSinceLastArrival);

        return {
            eta_seconds,
            method: "historical_segments",
            segment_count: remainingStops.length,
            time_since_last_arrival: timeSinceLastArrival,
            confidence: this.calculateConfidence(lastConfirmedStop.minutesSinceArrival)
        };
    }

    async getSegmentTime(fromStopId, toStopId) {
        const cacheKey = `segment:${fromStopId}:${toStopId}`;
        const cached = await redis.get(cacheKey);

        if (cached) {
            return parseInt(cached);
        }

        const result = await getSegmentTimes(fromStopId, toStopId);

        if (result.length > 0) {
            const avgTime = result[0].avg_travel_seconds;
            await redis.setex(cacheKey, 600, avgTime);
            return avgTime;
        }

        const avgTime = await calculateSegmentTimeFromArrivals(fromStopId, toStopId);
        return avgTime || 300;

    }
}

export default BaseEtaService;


class ETAFusionEngine {
    constructor() {
        this.baseEtaService = new BaseEtaService();
        this.busProgressionService = new BusProgressionService();
    }

    async calculateFinalEta(busId, targetStopId, location) {
        const lastConfirmedStop = await this.baseEtaService.busProgressionService.getLastConfirmedStop(busId);

        const scheduleBasedETA = await this.baseEtaService.calculateScheduleBasedETA(
            busId,
            targetStopId
        );
        const historicalETA = await this.baseEtaService.calculateHistoricalETA(
            busId,
            targetStopId
        );

        const mlETA = await predictETAWithML({
            busId,
            targetStopId,
            location
        });

        const weights = this.calculateWeights(
            lastConfirmedStop,
            scheduleBasedETA,
            historicalETA,
            mlETA
        );

        // Perform weighted fusion of all available predictions
        let finalETA = 0;
        const methodsUsed = [];

        if (historicalETA.eta_seconds !== null && weights.historical > 0) {
            finalETA += historicalETA.eta_seconds * weights.historical;
            methodsUsed.push({
                method: 'historical',
                eta: historicalETA.eta_seconds,
                weight: weights.historical
            });
        }

        if (scheduleBasedETA.eta_seconds !== null && weights.schedule > 0) {
            finalETA += scheduleBasedETA.eta_seconds * weights.schedule;
            methodsUsed.push({
                method: 'schedule',
                eta: scheduleBasedETA.eta_seconds,
                weight: weights.schedule
            });
        }

        if (mlETA?.mlPrediction !== null && weights.ml > 0) {
            finalETA += mlETA.mlPrediction * weights.ml;
            methodsUsed.push({
                method: 'ml',
                eta: mlETA.mlPrediction,
                weight: weights.ml,
                ml_confidence: mlETA.confidence
            });
        }

        // Calculate overall confidence based on weighted contributors
        const confidence = this.calculateOverallConfidence(weights, mlETA, lastConfirmedStop);
        const uncertaintyRange = this.estimateUncertainty(finalETA, confidence);

        return {
            eta_seconds: Math.round(finalETA),
            eta_minutes: Math.round(finalETA / 60),
            arrival_time: new Date(Date.now() + finalETA * 1000),
            confidence: confidence,
            freshness_minutes: lastConfirmedStop?.minutesSinceArrival || null,
            last_checkpoint_stop: lastConfirmedStop?.stopId || null,
            methods_used: methodsUsed,
            weights: weights,
            uncertainty_range: uncertaintyRange
        };
    }

    /**
     * Calculate overall confidence based on weight distribution and data quality
     */
    calculateOverallConfidence(weights, mlETA, lastConfirmedStop) {
        let confidence = 0;

        // ML contribution to confidence
        if (mlETA?.confidence && weights.ml > 0) {
            confidence += mlETA.confidence * weights.ml;
        }

        // Historical contribution (moderate confidence)
        if (weights.historical > 0) {
            const historicalConfidence = lastConfirmedStop
                ? Math.max(0.3, 0.8 - (lastConfirmedStop.minutesSinceArrival / 30))
                : 0.3;
            confidence += historicalConfidence * weights.historical;
        }

        // Schedule contribution (baseline confidence)
        if (weights.schedule > 0) {
            confidence += 0.4 * weights.schedule; // Schedule has moderate baseline confidence
        }

        return Math.max(0.1, Math.min(0.95, confidence));
    }

    /**
     * Estimate uncertainty range based on ETA and confidence
     */
    estimateUncertainty(eta_seconds, confidence) {
        // Base uncertainty percentage
        let uncertainty_pct = eta_seconds > 600 ? 0.3 : 0.2;

        // Reduce uncertainty for high confidence
        if (confidence > 0.7) {
            uncertainty_pct *= 0.6;
        } else if (confidence > 0.5) {
            uncertainty_pct *= 0.8;
        }

        return {
            min_seconds: Math.max(0, Math.round(eta_seconds * (1 - uncertainty_pct))),
            max_seconds: Math.round(eta_seconds * (1 + uncertainty_pct)),
            min_minutes: Math.max(0, Math.round((eta_seconds * (1 - uncertainty_pct)) / 60)),
            max_minutes: Math.round((eta_seconds * (1 + uncertainty_pct)) / 60)
        };
    }


    /**
     * Calculate dynamic weights using mathematical functions
     * Uses continuous functions instead of discrete thresholds for smoother, more accurate weighting
     */
    calculateWeights(lastConfirmedStop, scheduleBasedETA, historicalETA, mlETA) {
        const weights = { schedule: 0, historical: 0, ml: 0 };

        // No recent tracking data - rely heavily on schedule
        if (!lastConfirmedStop) {
            weights.schedule = 0.8;
            weights.historical = 0.2;
            weights.ml = 0;
            return this.normalizeWeights(weights);
        }

        // If ML prediction is available with confidence, use dynamic weighting
        if (mlETA?.mlPrediction && mlETA.confidence !== undefined) {
            const mlConfidence = mlETA.confidence; // This is the ML model's confidence (0-1)

            // Also get checkpoint freshness if available
            const checkpointFreshness = mlETA.features?.checkpoint_freshness_score || 0;

            // Combine ML confidence and checkpoint freshness for a comprehensive trust score
            // Both are 0-1, so we can take their geometric mean for a balanced score
            const trustScore = Math.sqrt(mlConfidence * checkpointFreshness);

            // Calculate ML weight using a sigmoid-like curve
            // This provides smooth scaling: high trust → high ML weight, low trust → low ML weight
            const mlWeight = this.calculateMLWeight(trustScore);

            // Schedule weight inversely proportional to trust score
            // Low trust → rely more on schedule
            const scheduleWeight = this.calculateScheduleWeight(trustScore);

            // Historical weight fills the gap, with a baseline contribution
            const historicalWeight = 1 - mlWeight - scheduleWeight;

            weights.ml = Math.max(0, Math.min(1, mlWeight));
            weights.schedule = Math.max(0, Math.min(1, scheduleWeight));
            weights.historical = Math.max(0, Math.min(1, historicalWeight));
        }
        // No ML prediction - fallback to historical + schedule based on checkpoint age
        else {
            const minutesSince = lastConfirmedStop.minutesSinceArrival;

            // Use exponential decay for historical weight as data ages
            const ageFactor = Math.exp(-minutesSince / 15); // Decay with 15-min half-life

            weights.historical = 0.3 + (0.4 * ageFactor); // Range: 0.3 to 0.7
            weights.schedule = 1 - weights.historical;
            weights.ml = 0;
        }

        return this.normalizeWeights(weights);
    }

    /**
     * Calculate ML weight using a smooth sigmoid-like function
     * Maps trust score (0-1) to ML weight with configurable steepness
     */
    calculateMLWeight(trustScore) {
        // Sigmoid function: w = max_weight / (1 + e^(-steepness * (trust - midpoint)))
        const maxWeight = 0.70;  // Maximum ML weight when trust is very high
        const steepness = 8;     // How quickly weight changes (higher = steeper curve)
        const midpoint = 0.5;    // Trust score where weight is half of max

        const sigmoidValue = maxWeight / (1 + Math.exp(-steepness * (trustScore - midpoint)));

        return sigmoidValue;
    }

    /**
     * Calculate schedule weight - inversely related to trust score
     * Low trust → high schedule weight (fallback to planned times)
     */
    calculateScheduleWeight(trustScore) {
        // Inverse relationship with smooth curve
        const minWeight = 0.05;  // Minimum schedule weight (even with high trust)
        const maxWeight = 0.70;  // Maximum schedule weight (when trust is very low)

        // Inverse sigmoid: starts high, decreases as trust increases
        const scheduleWeight = minWeight + (maxWeight - minWeight) * (1 - trustScore);

        return scheduleWeight;
    }

    /**
     * Normalize weights to sum to 1.0
     */
    normalizeWeights(weights) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);

        // Safety check: if sum is 0, default to schedule-only
        if (sum === 0) {
            return { schedule: 1, historical: 0, ml: 0 };
        }

        return {
            schedule: weights.schedule / sum,
            historical: weights.historical / sum,
            ml: weights.ml / sum
        };
    }
}

export { ETAFusionEngine };