import redis from "../config/redis.js";
import BusProgressionService from "./busProgression.service.js";
import { getActiveOrNextTripForBus } from "../models/shedule.js";
import { predictETAWithML } from "./ml-eta-prediction/mlEtaIntegration.service.js";
import { getBusById } from "../models/bus.js";
import { getScheduledTime, getNextScheduledTime, getSegmentTime, calculateConfidence } from "../utils/eta-helpers.js";
import { emitBusETA } from "../socket/emitters/bus-updates.js";

class BaseEtaService {
    constructor() {
        this.busProgressionService = new BusProgressionService();
    }

    async calculateScheduleBasedETA(busId, targetStopId) {
        const lastConfirmedStop = await this.busProgressionService.getLastConfirmedStop(busId);
        const tripData = await getActiveOrNextTripForBus(busId);

        if (!tripData) {
            return { eta_seconds: null, method: "no_schedule" };
        }

        const { activeTrip, nextTrip, firstTrip } = tripData;

        const now = new Date();
        const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        let selectedTrip = null;
        let isWaitingForNext = false;

        if (activeTrip) {
            selectedTrip = activeTrip;
        } else if (nextTrip) {
            selectedTrip = nextTrip;
            isWaitingForNext = true;
        } else {
            selectedTrip = firstTrip;
            isWaitingForNext = true;
        }

        const targetStopSchedule = selectedTrip.stops.find(s => s.stop_id == targetStopId);
        if (!targetStopSchedule) {
            return { eta_seconds: null, method: "stop_not_in_trip" };
        }

        let scheduledETA = 0;

        if (isWaitingForNext) {
            let waitTimeSecs = selectedTrip.startSecs - currentSeconds;
            if (waitTimeSecs < 0) waitTimeSecs += 86400;

            const firstStop = selectedTrip.stops[0];
            const tripTransitTime = (targetStopSchedule.tMs - firstStop.tMs) / 1000;

            scheduledETA = waitTimeSecs + tripTransitTime;
        } else {
            const targetStopSecs = targetStopSchedule.tMs / 1000;
            if (currentSeconds > targetStopSecs) {
                return { eta_seconds: 0, method: "already_passed" };
            }
            scheduledETA = targetStopSecs - currentSeconds;
        }

        if (!lastConfirmedStop || isWaitingForNext) {
            return {
                eta_seconds: Math.max(0, scheduledETA),
                method: "schedule_only",
                is_waiting: isWaitingForNext,
                confidence: 0.2
            };
        }

        const lastStopSchedule = selectedTrip.stops.find(s => s.stop_id == lastConfirmedStop.stopId);
        if (!lastStopSchedule) {
            return {
                eta_seconds: Math.max(0, scheduledETA),
                method: "schedule_only",
                confidence: 0.2
            };
        }

        const scheduledAtLastStop = new Date();
        const [h, m, s] = lastStopSchedule.sheduled_arrival_time.split(':').map(Number);
        scheduledAtLastStop.setHours(h, m, s || 0, 0);

        const currentDelay = lastConfirmedStop.arrivedAt - scheduledAtLastStop.getTime();

        const eta_seconds = Math.max(0, scheduledETA + (currentDelay / 1000));

        return {
            eta_seconds,
            method: "schedule_with_delay",
            is_waiting: false,
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

        const bus = await getBusById(busId);
        const routeId = bus?.route_id;

        let totalTime = 0;
        let fromStopId = lastConfirmedStop.stopId;

        for (const stop of remainingStops) {
            const segmentTime = await getSegmentTime(fromStopId, stop.id, routeId);
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
}

export default BaseEtaService;


class ETAFusionEngine {
    constructor() {
        this.baseEtaService = new BaseEtaService();
        this.busProgressionService = new BusProgressionService();
    }

    async calculateFinalEta(data) {
        const { bus: { busId, routeId }, targetStopId, location } = data;

        const lastConfirmedStop = await this.baseEtaService.busProgressionService.getLastConfirmedStop(busId);

        const historicalETA = await this.baseEtaService.calculateHistoricalETA(
            busId,
            targetStopId
        );

        if (historicalETA.method === "already_passed") {
            return {
                eta_seconds: 0,
                eta_minutes: 0,
                arrival_time: null,
                confidence: 1,
                freshness_minutes: lastConfirmedStop?.minutesSinceArrival || null,
                last_confirmed_stop: lastConfirmedStop?.stopId || null,
                methods_used: [],
                weights: {},
                uncertainty_range: {},
                is_passed: true
            };
        }

        const scheduleBasedETA = await this.baseEtaService.calculateScheduleBasedETA(
            busId,
            targetStopId
        );

        const mlETA = await predictETAWithML(data);

        const weights = this.calculateWeights(
            lastConfirmedStop,
            mlETA,
            scheduleBasedETA
        );

        let finalETA = 0;
        const methods = [];

        if (historicalETA.eta_seconds !== null && historicalETA.eta_seconds !== 0 && weights.historical > 0) {
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

        try {
            await emitBusETA(busId, targetStopId, {
                eta_seconds: Math.round(finalETA),
                eta_minutes: Math.round(finalETA / 60),
                confidence: mlETA?.confidence || 0.5,
                arrival_time: new Date(Date.now() + finalETA * 1000)
            });
        } catch (e) {
            console.warn("ETA socket emit error:", e.message);
        }

        try {
            const etaKey = `eta:${routeId}:${busId}:${targetStopId}`;
            await redis.hset(etaKey, {
                eta_seconds: String(Math.round(finalETA)),
                eta_minutes: String(Math.round(finalETA / 60)),
                confidence: String(confidence),
                arrival_time: new Date(Date.now() + finalETA * 1000).toISOString(),
                updated_at: new Date().toISOString()
            });
            await redis.expire(etaKey, 300);
        } catch (e) {
            console.warn("ETA Redis store error:", e.message);
        }

        const finalResult = {
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

        console.log(`Final ETA Result for Bus ${busId} to Stop ${targetStopId}:`, JSON.stringify(finalResult, null, 2));

        return finalResult;
    }


    calculateWeights(lastConfirmedStop, mlETA, scheduleBasedETA) {
        const weights = { schedule: 0, historical: 0, ml: 0 };

        if (scheduleBasedETA?.is_waiting) {
            weights.schedule = 1.0;
            return weights;
        }

        if (!lastConfirmedStop) {
            weights.schedule = 1.0;
            weights.historical = 0;
            weights.ml = 0;

            return this.normalizeWeights(weights);
        }

        if (mlETA.mlPrediction && mlETA.confidence !== undefined) {
            const mlConfidence = mlETA.confidence;

            let mlWeight = this.calculateMlWeight(mlConfidence);

            const minutesSince = lastConfirmedStop.minutesSinceArrival || 0;

            const mlAgeFactor = Math.exp(-minutesSince / 30);
            mlWeight = mlWeight * mlAgeFactor;

            const rawScheduleWeight = this.calculateScheduleWeight(mlConfidence);
            const scheduleWeight = Math.min(rawScheduleWeight, 0.15);

            const historicalWeight = Math.max(0, 1 - mlWeight - scheduleWeight);

            weights.ml = Math.max(0, Math.min(1, mlWeight));
            weights.schedule = Math.max(0, Math.min(1, scheduleWeight));
            weights.historical = Math.max(0, Math.min(1, historicalWeight));
        } else {
            const minutesSince = lastConfirmedStop.minutesSinceArrival;

            const ageFactor = Math.exp(-minutesSince / 15);

            weights.historical = 0.85 * ageFactor;
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