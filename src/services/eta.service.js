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
        const segmentTimes = [];

        for (const stop of remainingStops) {
            const segmentTime = await getSegmentTime(fromStopId, stop.id, routeId);
            segmentTimes.push(segmentTime);
            totalTime += segmentTime;
            fromStopId = stop.id;
        }

        const timeSinceLastArrival = (Date.now() - lastConfirmedStop.arrivedAt) / 1000;

        let cumulativeTime = 0;
        let inferredPassedCount = 0;

        for (let i = 0; i < remainingStops.length; i++) {
            cumulativeTime += segmentTimes[i];
            if (timeSinceLastArrival > cumulativeTime * 3) {
                inferredPassedCount = i + 1;
            } else {
                break;
            }
        }

        if (inferredPassedCount >= remainingStops.length) {
            return { eta_seconds: 0, method: "already_passed" };
        }

        let adjustedTotalTime = 0;
        for (let i = inferredPassedCount; i < segmentTimes.length; i++) {
            adjustedTotalTime += segmentTimes[i];
        }

        let timeConsumedToInferredPoint = 0;
        for (let i = 0; i < inferredPassedCount; i++) {
            timeConsumedToInferredPoint += segmentTimes[i];
        }
        const timeSinceInferredPoint = timeSinceLastArrival - timeConsumedToInferredPoint;
        const eta_seconds = Math.max(0, adjustedTotalTime - timeSinceInferredPoint);

        return {
            eta_seconds,
            method: inferredPassedCount > 0 ? "historical_inferred" : "historical_segments",
            segment_count: remainingStops.length - inferredPassedCount,
            inferred_passed: inferredPassedCount,
            time_since_last_arrival: timeSinceLastArrival,
            confidence: calculateConfidence(lastConfirmedStop.minutesSinceArrival),
            segment_times: segmentTimes,
            base_travel_time: adjustedTotalTime,
            last_stop_id: lastConfirmedStop.stopId,
            remaining_stops_ids: remainingStops.map(s => s.id)
        };
    }

    async logHistoricalETATrainingData(busId, targetStopId, historicalETA) {
        try {
            if (!historicalETA || historicalETA.eta_seconds === null || historicalETA.eta_seconds === 0) {
                return;
            }

            const trainingData = {
                bus_id: busId,
                target_stop_id: targetStopId,
                last_stop: historicalETA.last_stop_id,
                inferred_passed: historicalETA.inferred_passed,
                time_since_last_stop: historicalETA.time_since_last_arrival,
                segment_times: JSON.stringify(historicalETA.segment_times || []),
                base_travel_time: historicalETA.base_travel_time,
                final_eta: historicalETA.eta_seconds,
                logged_at: Date.now()
            };

            const key = `eta_training:${busId}:${targetStopId}`;
            await redis.set(key, JSON.stringify(trainingData), "EX", 7200);

            console.log(`Historical ETA training data logged for bus ${busId} -> stop ${targetStopId} (base=${Math.round(historicalETA.base_travel_time)}s, inferred_passed=${historicalETA.inferred_passed})`);
        } catch (error) {
            console.warn("Failed to log historical ETA training data:", error.message);
        }
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

        await this.baseEtaService.logHistoricalETATrainingData(busId, targetStopId, historicalETA);

        const scheduleBasedETA = await this.baseEtaService.calculateScheduleBasedETA(
            busId,
            targetStopId
        );

        const mlETA = await predictETAWithML(data);

        const baseTravelTime = historicalETA.base_travel_time || historicalETA.eta_seconds || 0;
        let finalETA = 0;
        const methods = [];

        const hasML = mlETA.mlPrediction !== null && mlETA.mlPrediction !== undefined && mlETA.confidence !== undefined;
        const hasHistorical = historicalETA.eta_seconds !== null;
        const hasSchedule = scheduleBasedETA.eta_seconds !== null;

        if (hasML && hasHistorical) {
            const mlDelay = mlETA.mlDelay || (mlETA.mlPrediction - baseTravelTime);
            finalETA = Math.max(0, baseTravelTime + mlDelay);

            methods.push({
                method: "baseline_plus_ml_delay",
                base_travel_time: baseTravelTime,
                ml_delay: mlDelay,
                eta: finalETA,
                ml_confidence: mlETA.confidence
            });

            if (hasSchedule && scheduleBasedETA.eta_seconds > 0) {
                const scheduleCap = scheduleBasedETA.eta_seconds * 2;
                const scheduleFloor = scheduleBasedETA.eta_seconds * 0.2;

                const isEarlyTrip = baseTravelTime < 600 || historicalETA.inferred_passed === 0;
                const isSmallDelay = Math.abs(mlDelay) < 900;

                if (isSmallDelay || isEarlyTrip) {
                    if (finalETA > scheduleCap && isSmallDelay) {
                        finalETA = scheduleCap;
                        methods.push({ method: "schedule_cap_applied", schedule_eta: scheduleBasedETA.eta_seconds });
                    } else if (finalETA < scheduleFloor && finalETA > 0) {
                        if (baseTravelTime > 120) {
                            finalETA = scheduleFloor;
                            methods.push({ method: "schedule_floor_applied", schedule_eta: scheduleBasedETA.eta_seconds });
                        }
                    }
                }
            }
        } else if (hasHistorical) {
            finalETA = historicalETA.eta_seconds;
            methods.push({
                method: "historical_fallback",
                eta: historicalETA.eta_seconds,
                base_travel_time: baseTravelTime
            });
        } else if (hasSchedule) {
            finalETA = scheduleBasedETA.eta_seconds;
            methods.push({
                method: "schedule_fallback",
                eta: scheduleBasedETA.eta_seconds
            });
        }

        const confidence = this.calculateOverallConfidence(
            { historical: hasHistorical ? 0.5 : 0, schedule: hasSchedule ? 0.2 : 0, ml: hasML ? 0.8 : 0 },
            mlETA,
            lastConfirmedStop
        );
        const uncertaintyRange = this.estimateUncertainty(finalETA, confidence);

        const remainingStopsFull = await this.baseEtaService.busProgressionService.getRemainingStops(busId);
        let routeEtas = [];

        if (remainingStopsFull && remainingStopsFull.length > 0) {
            let totalTimeFull = 0;
            let fromStopId = lastConfirmedStop?.stopId;
            if (!fromStopId) fromStopId = remainingStopsFull[0].id;

            const segmentTimesFull = [];
            for (const stop of remainingStopsFull) {
                const segmentTime = await getSegmentTime(fromStopId, stop.id, routeId);
                segmentTimesFull.push(segmentTime);
                totalTimeFull += segmentTime;
                fromStopId = stop.id;
            }

            const timeSinceLastArrival = lastConfirmedStop ? (Date.now() - lastConfirmedStop.arrivedAt) / 1000 : 0;
            let cumulativeTime = 0;
            let inferredPassedCountFull = 0;

            for (let i = 0; i < remainingStopsFull.length; i++) {
                cumulativeTime += segmentTimesFull[i];
                if (timeSinceLastArrival > cumulativeTime * 3) {
                    inferredPassedCountFull = i + 1;
                } else {
                    break;
                }
            }

            let timeConsumedToInferredPoint = 0;
            for (let i = 0; i < inferredPassedCountFull; i++) {
                timeConsumedToInferredPoint += segmentTimesFull[i];
            }
            const timeSinceInferredPoint = timeSinceLastArrival - timeConsumedToInferredPoint;

            let cumulativeBaseTime = 0;
            const finalDelay = finalETA - baseTravelTime;

            for (let i = 0; i < remainingStopsFull.length; i++) {
                if (i < inferredPassedCountFull) {
                    routeEtas.push({
                        stop_id: remainingStopsFull[i].id,
                        eta_seconds: 0,
                        eta_minutes: 0,
                        is_passed: true
                    });
                } else {
                    cumulativeBaseTime += segmentTimesFull[i];
                    let stopBaseTime = Math.max(0, cumulativeBaseTime - timeSinceInferredPoint);
                    let stopEtaSeconds = Math.max(0, stopBaseTime + finalDelay);

                    routeEtas.push({
                        stop_id: remainingStopsFull[i].id,
                        eta_seconds: Math.round(stopEtaSeconds),
                        eta_minutes: Math.round(stopEtaSeconds / 60),
                        is_passed: false
                    });
                }
            }
        }

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
            weights: { base_travel_time: baseTravelTime, ml_available: hasML },
            uncertainty_range: uncertaintyRange,
            route_etas: routeEtas
        };

        console.log(`Final ETA Result for Bus ${busId} to Stop ${targetStopId}:`, JSON.stringify(finalResult, null, 2));

        return finalResult;
    }


    calculateWeights(lastConfirmedStop, mlETA, scheduleBasedETA, tripDurationMinutes = 120) {
        const weights = { schedule: 0, historical: 0, ml: 0 };

        const activeThresholdMinutes = Math.min(240, Math.max(30, tripDurationMinutes * 1.5));
        const isActuallyActive = lastConfirmedStop && lastConfirmedStop.minutesSinceArrival < activeThresholdMinutes;

        if (scheduleBasedETA?.is_waiting && !lastConfirmedStop) {
            weights.schedule = 1.0;
            return weights;
        }

        if (!lastConfirmedStop && (!mlETA.mlPrediction || mlETA.confidence === undefined)) {
            weights.schedule = 1.0;
            weights.historical = 0;
            weights.ml = 0;

            return this.normalizeWeights(weights);
        }

        if (mlETA.mlPrediction && mlETA.confidence !== undefined) {
            const mlConfidence = mlETA.confidence;

            let mlWeight = this.calculateMlWeight(mlConfidence);

            const minutesSince = lastConfirmedStop?.minutesSinceArrival || 0;

            const mlAgeFactor = Math.exp(-minutesSince / 60);
            mlWeight = mlWeight * mlAgeFactor;

            if (lastConfirmedStop && mlWeight < 0.15) {
                mlWeight = 0.15 * mlAgeFactor;
                mlWeight = Math.max(0.05, mlWeight);
            }

            let scheduleWeight = Math.min(this.calculateScheduleWeight(mlConfidence), 0.15);

            if (scheduleBasedETA?.is_waiting && lastConfirmedStop) {
                scheduleWeight = 0;
            }

            const historicalWeight = Math.max(0, 1 - mlWeight - scheduleWeight);

            weights.ml = Math.max(0, Math.min(1, mlWeight));
            weights.schedule = Math.max(0, Math.min(1, scheduleWeight));
            weights.historical = Math.max(0, Math.min(1, historicalWeight));
        } else {
            const minutesSince = lastConfirmedStop?.minutesSinceArrival || 0;

            const ageFactor = Math.exp(-minutesSince / 15);

            if (scheduleBasedETA?.is_waiting && lastConfirmedStop) {
                weights.historical = 1.0;
                weights.schedule = 0;
            } else {
                weights.historical = 0.85 * ageFactor;
                weights.schedule = 1 - weights.historical;
            }

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