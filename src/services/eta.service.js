import redis from "../config/redis.js";
import BusProgressionService from "./busProgression.service.js";
import { getActiveOrNextTripForBus } from "../models/shedule.js";
import { predictETAWithML } from "./ml-eta-prediction/mlEtaIntegration.service.js";
import { getBusById } from "../models/bus.js";
import { getRouteStops } from "../models/route.js";
import { getSegmentTime, calculateConfidence, getSegmentDistance } from "../utils/eta-helpers.js";
import { emitBusETA } from "../socket/emitters/bus-updates.js";


class BaseEtaService {
    constructor() {
        this.busProgressionService = new BusProgressionService();
    }

    async fetchSegmentTimes(routeId, fromStopId, stops) {
        if (!stops.length) return [];

        const pipeline = redis.pipeline();
        const keyMeta = [];
        let from = fromStopId;

        for (const stop of stops) {
            const key = `segment:${routeId}:${from}:${stop.id}`;
            keyMeta.push({ key, from, to: stop.id });
            pipeline.get(key);
            from = stop.id;
        }

        const results = await pipeline.exec();
        const times = [];
        const missing = [];

        for (let i = 0; i < stops.length; i++) {
            const cached = results[i][1];
            if (cached !== null && cached !== undefined) {
                times.push(Number(cached));
            } else {
                missing.push({ index: i, ...keyMeta[i] });
                times.push(null);
            }
        }

        if (missing.length > 0) {
            const fetched = await Promise.all(
                missing.map(m => getSegmentTime(m.from, m.to, routeId))
            );
            const cachePipeline = redis.pipeline();
            for (let i = 0; i < missing.length; i++) {
                const t = Number(fetched[i]) || 0;
                times[missing[i].index] = t;
                if (t > 0) cachePipeline.setex(missing[i].key, 3600, t);
            }
            await cachePipeline.exec();
        }

        return times.map(t => t ?? 0);
    }

    async fetchSegmentDistances(routeId, fromStopId, stops) {
        if (!stops.length) return [];

        const pipeline = redis.pipeline();
        const keyMeta = [];
        let from = fromStopId;

        for (const stop of stops) {
            const key = `distance:${routeId}:${from}:${stop.id}`;
            keyMeta.push({ key, from, to: stop.id });
            pipeline.get(key);
            from = stop.id;
        }

        const results = await pipeline.exec();
        const distances = [];
        const missing = [];

        for (let i = 0; i < stops.length; i++) {
            const cached = results[i][1];
            if (cached !== null && cached !== undefined) {
                distances.push(Number(cached));
            } else {
                missing.push({ index: i, ...keyMeta[i] });
                distances.push(null);
            }
        }

        if (missing.length > 0) {
            const fetched = await Promise.all(
                missing.map(m => getSegmentDistance(m.from, m.to, routeId))
            );
            const cachePipeline = redis.pipeline();
            for (let i = 0; i < missing.length; i++) {
                const d = Number(fetched[i]) || 0;
                distances[missing[i].index] = d;
                if (d > 0) cachePipeline.setex(missing[i].key, 86400, d);
            }
            await cachePipeline.exec();
        }

        return distances.map(d => d ?? 0);
    }

    async deriveCurrentSpeed(busId, routeId, lastConfirmedStop) {
        try {
            const recentStops = await this.busProgressionService.getRecentStops(busId, 4);
            const timeSinceLastArrival = (Date.now() - lastConfirmedStop.arrivedAt) / 1000;

            if (recentStops && recentStops.length >= 3) {
                const segmentSpeeds = [];
                for (let i = 0; i < Math.min(3, recentStops.length - 1); i++) {
                    const curr = recentStops[i];
                    const prev = recentStops[i + 1];
                    if (!curr.arrivedAt || !prev.arrivedAt) continue;
                    const dist = await getSegmentDistance(prev.stopId, curr.stopId, routeId);
                    const travelTime = (curr.arrivedAt - prev.arrivedAt) / 1000;
                    if (dist && travelTime > 0) {
                        const spd = dist / travelTime;
                        if (spd >= 0.5 && spd <= 25.0) segmentSpeeds.push(spd);
                    }
                }

                if (segmentSpeeds.length > 0) {
                    const newSpeed = segmentSpeeds.reduce((a, b) => a + b, 0) / segmentSpeeds.length;
                    const speedKey = `speed:${busId}`;
                    const prev = await redis.get(speedKey);
                    const blended = prev ? 0.7 * Number(prev) + 0.3 * newSpeed : newSpeed;
                    await redis.setex(speedKey, 300, blended);
                    if (blended >= 1.0 && blended <= 20.0) return blended;
                }
            } else {
                const dist = await getSegmentDistance(
                    lastConfirmedStop.previousStopId ?? lastConfirmedStop.stopId,
                    lastConfirmedStop.stopId,
                    routeId
                );
                if (dist && timeSinceLastArrival > 0) {
                    const spd = dist / timeSinceLastArrival;
                    if (spd >= 0.5 && spd <= 15.0) return spd;
                }
            }
        } catch (e) {
            console.warn("Speed derivation failed:", e.message);
        }
        return null;
    }

    calculateSpeedConfidence(speed, timeSinceLastArrival) {
        let c = 0.5;
        if (speed >= 3 && speed <= 15) c += 0.2;
        if (timeSinceLastArrival < 300) c += 0.2;
        else if (timeSinceLastArrival < 600) c += 0.1;
        if (timeSinceLastArrival < 30) c -= 0.1;
        return Math.max(0.1, Math.min(0.9, c));
    }

    async logTrainingData(busId, targetStopId, finalETA, baseTravelTime, inferredPassed, timeSinceLastArrival, segmentTimes) {
        try {
            if (!finalETA) return;
            await redis.set(
                `eta_training:${busId}:${targetStopId}`,
                JSON.stringify({
                    bus_id: busId,
                    target_stop_id: targetStopId,
                    inferred_passed: inferredPassed,
                    time_since_last_stop: timeSinceLastArrival,
                    segment_times: JSON.stringify(segmentTimes || []),
                    base_travel_time: baseTravelTime,
                    final_eta: finalETA,
                    logged_at: Date.now()
                }),
                "EX", 7200
            );
        } catch (e) {
            console.warn("Failed to log ETA training data:", e.message);
        }
    }
}

export default BaseEtaService;


class ETAFusionEngine {
    constructor() {
        this.base = new BaseEtaService();
    }


    async calculateFinalEta(data) {
        const { bus: { busId, routeId }, targetStopId } = data;

        const [lastConfirmedStop, tripData] = await Promise.all([
            this.base.busProgressionService.getLastConfirmedStop(busId),
            getActiveOrNextTripForBus(busId)
        ]);

        const allRouteStops = await getRouteStops(busId);
        if (!allRouteStops?.length) {
            return this._emptyResult(lastConfirmedStop);
        }

        const tripResult = await this._computeTripETAs({
            busId, routeId, lastConfirmedStop, allRouteStops, tripData, targetStopId, data
        });

        const { routeEtas, finalETA, method, confidence, weights, isTargetPassed } = tripResult;

        const uncertaintyRange = this.estimateUncertainty(finalETA, confidence);

        try {
            await redis.setex(`route_eta:${busId}`, 300, JSON.stringify(routeEtas));
        } catch (e) {
            console.warn("Route ETA cache error:", e.message);
        }

        try {
            await emitBusETA(busId, targetStopId, {
                eta_seconds: Math.round(finalETA),
                eta_minutes: Math.round(finalETA / 60),
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

        const result = {
            eta_seconds: Math.round(finalETA),
            eta_minutes: Math.round(finalETA / 60),
            arrival_time: new Date(Date.now() + finalETA * 1000),
            confidence,
            freshness_minutes: lastConfirmedStop?.minutesSinceArrival ?? null,
            last_confirmed_stop: lastConfirmedStop?.stopId ?? null,
            methods_used: [{ method }],
            weights,
            uncertainty_range: uncertaintyRange,
            route_etas: routeEtas,
            is_passed: isTargetPassed
        };

        console.log(`ETA Bus ${busId} → Stop ${targetStopId}: ${Math.round(finalETA / 60)}m [${method}]`);
        return result;
    }

    async _isConfirmedStopStale(busId, lastConfirmedStop, tripData) {
        try {
            const now = new Date();
            const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            const minutesSinceArrival = lastConfirmedStop.minutesSinceArrival ?? 0;

            if (tripData?.activeTrip?.endSecs !== undefined) {
                let endSecs = tripData.activeTrip.endSecs;
                if (endSecs < tripData.activeTrip.startSecs) endSecs += 86400;
                let adjustedCurrent = currentSeconds;
                if (adjustedCurrent < tripData.activeTrip.startSecs) adjustedCurrent += 86400;

                if (adjustedCurrent > endSecs + 300) {
                    return true;
                }
            }

            if (!tripData?.activeTrip && minutesSinceArrival > 90) {
                return true;
            }
            if (!tripData?.activeTrip && tripData?.nextTrip) {
                const ttl = await redis.ttl(`bus:${busId}:last_stop`);
                if (ttl > 3600 && minutesSinceArrival > 30) {
                    return true;
                }
            }

            return false;
        } catch (e) {
            console.warn(`_isConfirmedStopStale check failed for bus ${busId}:`, e.message);
            return false;
        }
    }

    async _computeTripETAs({ busId, routeId, lastConfirmedStop, allRouteStops, tripData, targetStopId, data }) {
        if (lastConfirmedStop) {
            const isStaleConfirmedStop = await this._isConfirmedStopStale(
                busId, lastConfirmedStop, tripData
            );

            if (isStaleConfirmedStop) {
                console.log(`Bus ${busId}: stale confirmed stop detected — flushing live keys, falling through to schedule`);
                redis.del(
                    `bus:${busId}:last_stop`,
                    `bus:${busId}:last_arrival_time`,
                    `route_eta:${busId}`,
                    `speed:${busId}`
                ).catch(() => {});
            } else {
                return this._computeLiveETAs({
                    busId, routeId, lastConfirmedStop, allRouteStops, targetStopId, tripData, data
                });
            }
        }

        const trip = tripData?.activeTrip ?? tripData?.nextTrip ?? tripData?.firstTrip;
        if (!trip) {
            return {
                routeEtas: [], finalETA: 0, method: 'no_schedule',
                confidence: 0, weights: { schedule: 1 },
                isTargetPassed: false
            };
        }

        if (tripData.activeTrip) {
            const activeResult = await this._computeScheduledActiveETAs({ trip, allRouteStops, targetStopId });

            const allPassed = activeResult.routeEtas.length > 0
                && activeResult.routeEtas.every(e => e.is_passed);

            if (!allPassed) {
                return activeResult;
            }

            const fallbackTrip = tripData.nextTrip ?? tripData.firstTrip;
            if (!fallbackTrip) {
                return activeResult;
            }

            return this._computeWaitingETAs({ trip: fallbackTrip, allRouteStops, targetStopId });
        }

        return this._computeWaitingETAs({ trip, allRouteStops, targetStopId });
    }

    async _computeLiveETAs({ busId, routeId, lastConfirmedStop, allRouteStops, targetStopId, tripData, data }) {
        const timeSinceLastArrival = (Date.now() - lastConfirmedStop.arrivedAt) / 1000;

        const lastStopIndex = allRouteStops.findIndex(s => s.id === lastConfirmedStop.stopId);
        if (lastStopIndex === -1 || lastStopIndex >= allRouteStops.length - 1) {
            const nextTrip = tripData?.nextTrip ?? tripData?.firstTrip;
            if (nextTrip) {
                console.log(`Bus ${busId} at terminus — falling through to next trip schedule`);
                return this._computeWaitingETAs({ trip: nextTrip, allRouteStops, targetStopId });
            }

            if (tripData?.activeTrip) {
                console.log(`Bus ${busId} at terminus — falling through to active trip schedule`);
                const activeResult = await this._computeScheduledActiveETAs({
                    trip: tripData.activeTrip, allRouteStops, targetStopId
                });
                const allPassed = activeResult.routeEtas.length > 0
                    && activeResult.routeEtas.every(e => e.is_passed);
                if (!allPassed) return activeResult;

                const fallback = tripData.firstTrip;
                if (fallback) return this._computeWaitingETAs({ trip: fallback, allRouteStops, targetStopId });
            }

            return this._atTerminus(allRouteStops.slice(Math.max(lastStopIndex, 0)));
        }

        const remainingStops = allRouteStops.slice(lastStopIndex + 1);

        const segmentTimes = await this.base.fetchSegmentTimes(
            routeId, lastConfirmedStop.stopId, remainingStops
        );

        let cumulativeTime = 0;
        let inferredPassedCount = 0;
        for (let i = 0; i < remainingStops.length; i++) {
            cumulativeTime += segmentTimes[i];
            if (timeSinceLastArrival > cumulativeTime * 1.8) inferredPassedCount++;
            else break;
        }

        if (inferredPassedCount >= remainingStops.length) {
            return {
                routeEtas: remainingStops.map(s => ({
                    stop_id: s.id, eta_seconds: 0, eta_minutes: 0, is_passed: true
                })),
                finalETA: 0,
                method: 'live_all_inferred_passed',
                confidence: 0.9,
                weights: { historical: 1, ml: 0, speed: 0, schedule: 0 },
                isTargetPassed: true
            };
        }

        let timeConsumedToInferred = 0;
        for (let i = 0; i < inferredPassedCount; i++) timeConsumedToInferred += segmentTimes[i];
        const timeSinceInferred = timeSinceLastArrival - timeConsumedToInferred;

        let cumulativeBase = 0;
        const baseStopETAs = [];
        for (let i = 0; i < remainingStops.length; i++) {
            if (i < inferredPassedCount) {
                baseStopETAs.push(0);
                continue;
            }
            cumulativeBase += segmentTimes[i];
            let stopBase;
            if (i === inferredPassedCount) {
                const seg = segmentTimes[i];
                const progress = seg > 0 ? Math.min(1, timeSinceInferred / seg) : 1;
                stopBase = Math.max(0, seg * (1 - progress));
            } else {
                stopBase = Math.max(0, cumulativeBase - timeSinceInferred);
            }
            baseStopETAs.push(stopBase);
        }

        const targetIdx = targetStopId != null
            ? remainingStops.findIndex(s => s.id == targetStopId)
            : remainingStops.length - 1;
        const effectiveTargetIdx = targetIdx === -1 ? remainingStops.length - 1 : targetIdx;

        const baseTargetETA = baseStopETAs[effectiveTargetIdx] ?? 0;
        const isTargetPassedInBase = baseTargetETA === 0 && effectiveTargetIdx < inferredPassedCount;

        if (isTargetPassedInBase) {
            return {
                routeEtas: remainingStops.map((s, i) => ({
                    stop_id: s.id,
                    eta_seconds: Math.round(baseStopETAs[i]),
                    eta_minutes: Math.round(baseStopETAs[i] / 60),
                    is_passed: baseStopETAs[i] === 0
                })),
                finalETA: 0,
                method: 'live',
                confidence: 1,
                weights: { historical: 1, ml: 0, speed: 0, schedule: 0 },
                isTargetPassed: true
            };
        }

        let baseTravelTime = 0;
        for (let i = inferredPassedCount; i <= effectiveTargetIdx; i++) {
            baseTravelTime += segmentTimes[i];
        }
        baseTravelTime = Math.max(0, baseTravelTime - timeSinceInferred);

        let speedETA = null;
        let speedConf = 0;
        try {
            const currentSpeed = await this.base.deriveCurrentSpeed(busId, routeId, lastConfirmedStop);
            if (currentSpeed) {
                const stopsToTarget = remainingStops.slice(0, effectiveTargetIdx + 1);
                const distances = await this.base.fetchSegmentDistances(
                    routeId, lastConfirmedStop.stopId, stopsToTarget
                );
                const totalDist = distances.reduce((a, b) => a + b, 0);
                if (totalDist > 0) {
                    speedETA = (totalDist * 0.85) / currentSpeed;
                    speedConf = this.base.calculateSpeedConfidence(currentSpeed, timeSinceLastArrival);
                }
            }
        } catch (e) {
            console.warn("Speed ETA failed:", e.message);
        }

        const mlETA = await predictETAWithML(data);
        const hasML = mlETA?.mlPrediction != null && mlETA?.confidence != null;
        const hasSpeed = speedETA != null && speedETA > 0;

        let finalETA = baseTargetETA;

        if (hasSpeed && baseTravelTime > 0) {
            const sw = speedConf;
            finalETA = speedETA * sw + baseTargetETA * (1 - sw);

            if (hasML) {
                const mlDelay = mlETA.mlDelay ?? (mlETA.mlPrediction - baseTravelTime);
                const mw = mlETA.confidence * 0.4;
                finalETA = Math.max(0, finalETA * (1 - mw) + (baseTravelTime + mlDelay) * mw);
            }
        } else if (hasML && baseTravelTime > 0) {
            const mlDelay = mlETA.mlDelay ?? (mlETA.mlPrediction - baseTravelTime);
            finalETA = Math.max(0, baseTravelTime + mlDelay);
        }

        finalETA = Math.max(0, finalETA);

        const totalDelay = finalETA - baseTargetETA;
        const routeEtas = remainingStops.map((s, i) => {
            const base = baseStopETAs[i];
            if (base === 0) {
                return { stop_id: s.id, eta_seconds: 0, eta_minutes: 0, is_passed: true };
            }
            let stopEta = base;
            if (totalDelay !== 0 && baseTargetETA > 0) {
                const ratio = Math.min(1, base / baseTargetETA);
                stopEta = Math.max(0, base + totalDelay * ratio);
            }
            return {
                stop_id: s.id,
                eta_seconds: Math.round(stopEta),
                eta_minutes: Math.round(stopEta / 60),
                is_passed: false
            };
        });

        const speedObj = hasSpeed ? { eta_seconds: speedETA, confidence: speedConf } : { eta_seconds: null };
        const scheduleObj = { eta_seconds: null, is_waiting: false };
        const weights = this.calculateWeights(lastConfirmedStop, mlETA, scheduleObj, speedObj);
        const confidence = this.calculateOverallConfidence(weights, mlETA, lastConfirmedStop, speedObj);

        this.base.logTrainingData(
            busId, targetStopId, finalETA, baseTravelTime,
            inferredPassedCount, timeSinceLastArrival,
            segmentTimes.slice(0, effectiveTargetIdx + 1)
        ).catch(() => {});

        return {
            routeEtas,
            finalETA,
            method: 'live',
            confidence,
            weights,
            baseTravelTime,
            isTargetPassed: false
        };
    }

    async _computeScheduledActiveETAs({ trip, allRouteStops, targetStopId }) {
        const now = new Date();
        const normalizedCurrent = trip.normalizedCurrentSeconds
            ?? (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());

        const tripStopMap = new Map(trip.stops.map(s => [String(s.stop_id), s]));

        const routeEtas = [];
        for (const routeStop of allRouteStops) {
            const tripStop = tripStopMap.get(String(routeStop.id));
            if (!tripStop) continue;

            const scheduledSecs = tripStop.tMs / 1000;
            const isPassed = normalizedCurrent >= scheduledSecs;
            const etaSecs = isPassed ? 0 : Math.round(scheduledSecs - normalizedCurrent);

            routeEtas.push({
                stop_id: routeStop.id,
                eta_seconds: etaSecs,
                eta_minutes: Math.round(etaSecs / 60),
                is_passed: isPassed
            });
        }

        const targetEntry = routeEtas.find(e => e.stop_id == targetStopId)
            ?? routeEtas[routeEtas.length - 1];

        const finalETA = targetEntry?.eta_seconds ?? 0;

        return {
            routeEtas,
            finalETA,
            method: 'schedule_active',
            confidence: 0.7,
            weights: { schedule: 1, historical: 0, ml: 0, speed: 0 },
            isTargetPassed: targetEntry?.is_passed ?? false
        };
    }

    async _computeWaitingETAs({ trip, allRouteStops, targetStopId }) {
        const now = new Date();
        const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        let waitTimeSecs = trip.startSecs - currentSeconds;
        if (waitTimeSecs < 0) waitTimeSecs += 86400;

        const firstTripStop = trip.stops[0];
        const tripStopMap = new Map(trip.stops.map(s => [String(s.stop_id), s]));

        const routeEtas = [];
        for (const routeStop of allRouteStops) {
            const tripStop = tripStopMap.get(String(routeStop.id));
            if (!tripStop) continue;

            const transitFromStart = (tripStop.tMs - firstTripStop.tMs) / 1000;
            const etaSecs = Math.max(0, Math.round(waitTimeSecs + transitFromStart));

            routeEtas.push({
                stop_id: routeStop.id,
                eta_seconds: etaSecs,
                eta_minutes: Math.round(etaSecs / 60),
                is_passed: false,
                is_waiting: true
            });
        }

        const targetEntry = routeEtas.find(e => e.stop_id == targetStopId)
            ?? routeEtas[routeEtas.length - 1];

        const finalETA = targetEntry?.eta_seconds ?? 0;

        return {
            routeEtas,
            finalETA,
            method: 'waiting_for_trip',
            confidence: 0.5,
            weights: { schedule: 1, historical: 0, ml: 0, speed: 0 },
            isTargetPassed: false
        };
    }

    _emptyResult(lastConfirmedStop) {
        return {
            eta_seconds: 0, eta_minutes: 0,
            arrival_time: null, confidence: 0,
            freshness_minutes: null,
            last_confirmed_stop: lastConfirmedStop?.stopId ?? null,
            methods_used: [{ method: 'no_data' }],
            weights: {},
            uncertainty_range: {},
            route_etas: [],
            is_passed: false
        };
    }

    _atTerminus(remainingStops) {
        return {
            routeEtas: remainingStops.map(s => ({
                stop_id: s.id, eta_seconds: 0, eta_minutes: 0, is_passed: true
            })),
            finalETA: 0,
            method: 'at_terminus',
            confidence: 1,
            weights: { historical: 1 },
            isTargetPassed: true
        };
    }

    calculateWeights(lastConfirmedStop, mlETA, scheduleBasedETA, speedBasedETA = null, tripDurationMinutes = 120) {
        const weights = { schedule: 0, historical: 0, ml: 0, speed: 0 };

        const activeThresholdMinutes = Math.min(240, Math.max(30, tripDurationMinutes * 1.5));

        if (scheduleBasedETA?.is_waiting && !lastConfirmedStop) {
            weights.schedule = 1.0;
            return weights;
        }

        if (!lastConfirmedStop && (!mlETA?.mlPrediction || mlETA?.confidence === undefined)) {
            weights.schedule = 1.0;
            return this.normalizeWeights(weights);
        }

        if (speedBasedETA?.confidence && speedBasedETA?.eta_seconds != null) {
            const speedConf = speedBasedETA.confidence;
            weights.speed = speedConf * 0.8;
            const remaining = 1 - weights.speed;
            weights.historical = remaining * 0.6;
            weights.ml = remaining * 0.3;
            weights.schedule = remaining * 0.1;
        } else if (mlETA?.mlPrediction && mlETA?.confidence != null) {
            const mlConf = mlETA.confidence;
            let mlWeight = this.calculateMlWeight(mlConf);
            const minutesSince = lastConfirmedStop?.minutesSinceArrival || 0;
            const ageFactor = Math.exp(-minutesSince / 60);
            mlWeight = Math.max(0.05, mlWeight * ageFactor);

            let scheduleWeight = 0;
            if (!(scheduleBasedETA?.is_waiting && lastConfirmedStop)) {
                scheduleWeight = Math.min(this.calculateScheduleWeight(mlConf), 0.15);
            }

            weights.ml = Math.max(0, Math.min(1, mlWeight));
            weights.schedule = Math.max(0, Math.min(1, scheduleWeight));
            weights.historical = Math.max(0, 1 - mlWeight - scheduleWeight);
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

    calculateOverallConfidence(weights, mlETA, lastConfirmedStop, speedBasedETA = null) {
        let confidence = 0;

        if (mlETA?.confidence && weights.ml > 0) {
            confidence += mlETA.confidence * weights.ml;
        }
        if (weights.historical > 0) {
            const histConf = lastConfirmedStop
                ? Math.max(0.3, 0.8 - lastConfirmedStop.minutesSinceArrival / 30)
                : 0.3;
            confidence += histConf * weights.historical;
        }
        if (weights.schedule > 0) {
            confidence += 0.4 * weights.schedule;
        }
        if (weights.speed > 0 && speedBasedETA?.confidence) {
            confidence += speedBasedETA.confidence * weights.speed;
        }

        return Math.max(0, Math.min(1, confidence));
    }

    estimateUncertainty(eta_seconds, confidence) {
        let pct = eta_seconds > 600 ? 0.3 : 0.2;
        if (confidence > 0.7) pct *= 0.6;
        else if (confidence > 0.5) pct *= 0.75;
        else pct *= 0.95;

        return {
            min_seconds: Math.max(0, Math.round(eta_seconds * (1 - pct))),
            max_seconds: Math.round(eta_seconds * (1 + pct)),
            min_minutes: Math.max(0, Math.round(eta_seconds * (1 - pct) / 60)),
            max_minutes: Math.round(eta_seconds * (1 + pct) / 60),
            min_arrival_time: new Date(Date.now() + Math.max(0, Math.round(eta_seconds * (1 - pct))) * 1000),
            max_arrival_time: new Date(Date.now() + Math.round(eta_seconds * (1 + pct)) * 1000)
        };
    }

    calculateMlWeight(confidence) {
        return 0.70 / (1 + Math.exp(-8 * (confidence - 0.5)));
    }

    calculateScheduleWeight(confidence) {
        return 0.05 + 0.65 * (1 - confidence);
    }

    normalizeWeights(weights) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        if (sum === 0) return { schedule: 1, historical: 0, ml: 0, speed: 0 };
        return {
            schedule: weights.schedule / sum,
            historical: weights.historical / sum,
            ml: weights.ml / sum,
            speed: weights.speed / sum
        };
    }
}

export { ETAFusionEngine };