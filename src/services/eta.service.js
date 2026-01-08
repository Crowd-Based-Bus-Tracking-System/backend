import redis from "../config/redis.js";
import BusProgressionService from "./busProgression.service.js";
import { getSegmentTimes } from "../models/segments.js";
import { getScheduleForStop } from "../models/shedule.js";
import { calculateSegmentTimeFromArrivals } from "../models/arrival.js";
import { predictETAWithML } from "./ml-eta-prediction/mlEtaIntegration.service.js";
import { getScheduledTime, getNextScheduledTime, getSegmentTime, calculateConfidence } from "../utils/eta-helpers.js";

class BaseEtaService {
    constructor() {
        this.busProgressionService = new BusProgressionService();
    }

    async calculateScheduleBasedETA(busId, targetStopId) {
        const lastConfirmedStop = await this.busProgressionService.getLastConfirmedStop(busId);
        const schedule = await getScheduleForStop(busId, targetStopId);

        if (!schedule) {
            return { eta_seconds: null, method: "no_schedule" };
        }

        const now = Date.now();
        const scheduledTime = getNextScheduledTime(schedule);
        const scheduledETA = (scheduledTime - now) / 1000;

        if (!lastConfirmedStop) {
            return {
                eta_seconds: Math.max(0, scheduledETA),
                method: "schedule_only",
                confidence: 0.2
            };
        }

        const lastStopSchedule = await getScheduleForStop(busId, lastConfirmedStop.stopId);
        const currentDelay = lastConfirmedStop.arrivedAt - getScheduledTime(lastStopSchedule);

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
            confidence: calculateConfidence(lastConfirmedStop.minutesSinceArrival)
        };
    }

    async getSegmentTime(fromStopId, toStopId) {
        return await getSegmentTime(fromStopId, toStopId);
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

        let finalETA = 0;
        const methods = [];

        if (historicalETA.eta_seconds !== 0 && weights.historical > 0) {
            finalETA += historicalETA.eta_seconds * weights.historical;
            methods.push({
                method: "historical",
                eta: historicalETA.eta_seconds,
                weight: weights.historical
            })
        }

        if (scheduleBasedETA.eta_seconds !== 0 && weights.schedule > 0) {
            finalETA += scheduleBasedETA.eta_seconds * weights.schedule;
            methods.push({
                method: "schedule",
                eta: scheduleBasedETA.eta_seconds,
                weight: weights.schedule
            })
        }

        if (mlETA.mlPrediction && mlETA.confidence !== undefined && weights.ml > 0) {
            finalETA += mlETA.mlPrediction * weights.ml;
            methods.push({
                method: "ml",
                eta: mlETA.mlPrediction,
                weight: weights.ml,
                ml_confidence: mlETA.confidence
            })
        }

        const confidence = this.calculateOverallConfidence(weights, mlETA, lastConfirmedStop);
        const uncertaintyRange = this.estimateUncertainty(finalETA, confidence);

        return {
            eta_seconds: Math.round(finalETA),
            eta_minutes: Math.round(finalETA / 60),
            arrival_time: new Date(Date.now() + finalETA * 1000),
            confidence: confidence,
            freshness_minutes: lastConfirmedStop?.minutesSinceArrival || null,
            last_confirmed_stop: lastConfirmedStop?.stopId || null,
            methods_used: methods,
            weights: weights,
            uncertainty_range: uncertaintyRange,

        };
    }


    calculateWeights(lastConfirmedStop, mlETA) {
        const weights = { schedule: 0, historical: 0, ml: 0 };

        if (!lastConfirmedStop) {
            weights.schedule = 0.8;
            weights.historical = 0.2;
            weights.ml = 0;

            return this.normalizeWeights(weights);
        }

        if (mlETA.mlPrediction && mlETA.confidence !== undefined) {
            const mlConfidence = mlETA.confidence;

            const mlWeight = this.calculateMlWeight(mlConfidence);
            const scheduleWeight = this.calculateScheduleWeight(mlConfidence);
            const historicalWeight = 1 - mlWeight - scheduleWeight;

            weights.ml = Math.max(0, Math.min(1, mlWeight));
            weights.schedule = Math.max(0, Math.min(1, scheduleWeight));
            weights.historical = Math.max(0, Math.min(1, historicalWeight));
        } else {
            const minutesSince = lastConfirmedStop.minutesSinceArrival;

            const ageFactor = Math.exp(-minutesSince / 15);

            weights.historical = 0.3 * ageFactor;
            weights.schedule = 1 - weights.historical;
            weights.ml = 0;
        }

        return this.normalizeWeights(weights);
    }

    calculateOverallConfidence(weights, mlETA, lastConfirmedStop) {
        let confidence = 0;

        if (mlETA?.confidence && weights.ml > 0) {
            confidence += mlETA.confidence * weights.ml;
        }

        if (weights.historical > 0) {
            const historicalConf = lastConfirmedStop
                ? Math.max(0.3, 0.8 - (lastConfirmedStop.minutesSinceArrival / 30))
                : 0.3;

            confidence += historicalConf * weights.historical;
        }

        if (weights.schedule > 0) {
            confidence += 0.4 * weights.schedule;
        }

        return Math.max(0, Math.min(1, confidence));
    }

    estimateUncertainty(eta_seconds, confidence) {
        let uncertainty_pct = eta_seconds > 600 ? 0.3 : 0.2;

        if (confidence > 0.7) {
            uncertainty_pct *= 0.6;
        } else if (confidence > 0.5) {
            uncertainty_pct *= 0.75
        } else {
            uncertainty_pct *= 0.95;
        }

        return {
            min_seconds: Math.max(0, Math.round(eta_seconds * (1 - uncertainty_pct))),
            max_seconds: Math.round(eta_seconds * (1 + uncertainty_pct)),
            min_minutes: Math.max(0, Math.round(eta_seconds * (1 - uncertainty_pct) / 60)),
            max_minutes: Math.round(eta_seconds * (1 + uncertainty_pct) / 60),
            min_arrival_time: new Date(Date.now() + Math.max(0, Math.round(eta_seconds * (1 - uncertainty_pct))) * 1000),
            max_arrival_time: new Date(Date.now() + Math.round(eta_seconds * (1 + uncertainty_pct)) * 1000),
        }
    }

    calculateMlWeight(confidence) {
        const maxWeight = 0.70;
        const steepness = 8;
        const midpoint = 0.5;

        const sigmoidValue = maxWeight / (1 + Math.exp(-steepness * (confidence - midpoint)));

        return sigmoidValue;
    }

    calculateScheduleWeight(confidence) {
        const minWeight = 0.05;
        const maxWeight = 0.70;

        const scheduleWeight = minWeight + (maxWeight - minWeight) * (1 - confidence);

        return scheduleWeight;
    }

    normalizeWeights(weights) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);

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