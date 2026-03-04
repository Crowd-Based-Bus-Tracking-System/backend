import redis from "../config/redis.js";
import { checkDistance } from "../utils/check-distance.js";
import { storeReporterPosition, increaseReporterStatsOnReport, increaseReporterStatsOnConfirm } from "./reporter.service.js";
import { validateArrivalWithML, storeArrivalForTraining } from "./ml-arrival-confirmation/mlArrivalIntegration.service.js";
import { getPendingPrediction, logPredictionAccuracy } from "./ml-eta-prediction/mlEtaIntegration.service.js";
import { storeArrival, updateSegmentTime, getLastArrival } from "../models/arrival.js";
import { getBusById } from "../models/bus.js";
import { getRouteStops } from "../models/route.js";
import { getWeatherImpact } from "./weather.service.js";
import { getScheduledTime } from "../utils/eta-helpers.js";
import { getActiveOrNextTripForBus } from "../models/shedule.js";
import BusProgressionService from "./busProgression.service.js";
import { emitBusArrival, emitBusETA, emitBusPosition, emitRouteBusesUpdate } from "../socket/emitters/bus-updates.js";
import { getRouteBusesSortedByETA } from "./routeBuses.service.js";
import { getIO } from "../socket/index.js";

async function getScheduleForStop(busId, stopId) {
    const tripData = await getActiveOrNextTripForBus(busId);
    if (!tripData) return null;
    const selectedTrip = tripData.activeTrip || tripData.nextTrip || tripData.firstTrip;
    if (!selectedTrip) return null;
    return selectedTrip.stops.find(s => s.stop_id == stopId) || null;
}

const busProgressionService = new BusProgressionService();

const MIN_REPORTS = 3;
const MIN_REPORT_INTERVAL = 60 * 1000;
const ARRIVAL_EXPIRATION = 300;
const RADIUS_MIN_METERS = 999999999999999999999999;

export const reportArrival = async (data) => {
    const {
        bus: { busId, routeId },
        stopId,
        arrivalTime,
        user
    } = data;

    try {
        console.log(`Checking arrival report for bus ${busId} at stop ${stopId} from user ${user.id}`);
        const res = await checkDistance(stopId, user.lat, user.lng, RADIUS_MIN_METERS);
        console.log("Distance check result:", res);

        if (!res.confirmed) {
            return res;
        }

        const reportKey = `bus:${busId}:arrival_reports:${stopId}`;
        const confirmedKey = `bus:${busId}:stop:${stopId}:confirmed`;

        if (await redis.exists(confirmedKey)) {
            return {
                confirmed: false,
                message: "Arrival already reported"
            }
        }

        const reporterPosRes = await storeReporterPosition(data);
        console.log("Reporter Position", reporterPosRes);

        const cutoff = arrivalTime - MIN_REPORT_INTERVAL;

        console.log(`Adding report to Redis: ${reportKey}, user: ${user.id}, time: ${arrivalTime}`);

        const multi = redis.multi();
        multi.zadd(reportKey, arrivalTime, user.id);
        multi.zremrangebyscore(reportKey, 0, cutoff);
        multi.zcard(reportKey);
        multi.expire(reportKey, 120);

        const replies = await multi.exec();
        const reportCount = replies[2][1];

        await increaseReporterStatsOnReport(user.id);

        const io = getIO();
        const { getStopById } = await import("../models/stops.js");
        const stop = await getStopById(stopId);

        const reportPayload = {
            id: `rep_${Date.now()}_${user.id}`,
            busId: busId,
            stopId: stopId,
            stopName: stop?.name || "Unknown Stop",
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp_ms: Date.now(),
            upvotes: 1
        };

        try {
            await redis.hset(`report:${reportPayload.id}`, reportPayload);
            await redis.expire(`report:${reportPayload.id}`, 86400);
            await redis.zadd(`bus:${busId}:global_reports`, Date.now(), reportPayload.id);

            io.to(`route:${routeId}`).emit("bus:new_report", reportPayload);
        } catch (e) {
            console.warn("Failed to cache or broadcast report:", e.message);
        }

        const mlResult = await validateArrivalWithML(data, reportKey);

        if (mlResult.mlConfirmed !== null) {
            console.log(`ML prediction: ${mlResult.mlConfirmed ? "CONFIRM" : "REJECT"} (probability: ${mlResult.probability?.toFixed(3)})`);
        }

        const shouldConfirm = reportCount >= MIN_REPORTS && mlResult.mlConfirmed === true;

        console.log(`Validation: Reports=${reportCount}/${MIN_REPORTS}, ML=${mlResult.mlConfirmed}, Confirm=${shouldConfirm}`);

        if (shouldConfirm) {
            await redis.set(confirmedKey, true, "EX", ARRIVAL_EXPIRATION);

            let journeyExpirationSettings = 7200;
            try {
                const trips = await getActiveOrNextTripForBus(busId);
                const activeTrip = trips?.activeTrip || trips?.nextTrip || trips?.firstTrip;

                if (activeTrip && activeTrip.endSecs !== undefined) {
                    const now = new Date();
                    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

                    let remainingSeconds = activeTrip.endSecs - currentSeconds;

                    if (remainingSeconds < -43200) {
                        remainingSeconds += 86400;
                    }

                    if (remainingSeconds > 0) {
                        const dynamicBuffer = Math.max(900, Math.min(7200, Math.floor(remainingSeconds * 0.3)));
                        journeyExpirationSettings = Math.max(1800, Math.min(43200, remainingSeconds + dynamicBuffer));
                        console.log(`Dynamic expiration for Bus ${busId} at Stop ${stopId}: ${journeyExpirationSettings}s (Trip ends in ${remainingSeconds}s, Buffer: ${dynamicBuffer}s)`);
                    }
                } else {
                    const bus = await getBusById(busId);
                    if (bus && bus.route_id) {
                        const routeStops = await getRouteStops(busId);
                        const currentIndex = routeStops.findIndex(s => s.id === stopId);

                        if (currentIndex !== -1) {
                            const remainingStops = routeStops.length - 1 - currentIndex;
                            journeyExpirationSettings = Math.max(1800, Math.min(43200, (remainingStops * 15 * 60) + 1800));
                            console.log(`Fallback dynamic expiration for Bus ${busId}: ${journeyExpirationSettings}s (${remainingStops} stops remaining)`);
                        }
                    }
                }
            } catch (err) {
                console.warn(`Failed to calculate dynamic expiration for bus ${busId}:`, err.message);
            }

            await redis.set(`bus:${busId}:last_stop`, stopId.toString(), "EX", journeyExpirationSettings);
            await redis.set(`bus:${busId}:last_arrival_time`, arrivalTime.toString(), "EX", journeyExpirationSettings);

            try {
                await emitBusArrival(busId, stopId, arrivalTime);
                await emitBusPosition(busId, routeId);
                const updatedRouteBuses = await getRouteBusesSortedByETA(routeId, null, null);
                emitRouteBusesUpdate(routeId, updatedRouteBuses);
            } catch (error) {
                console.error("Failed to emit bus updates:", error);
            }

            const members = await redis.zrange(reportKey, 0, -1);
            for (const reporterId of members) {
                await increaseReporterStatsOnConfirm(reporterId);
            }

            if (mlResult.features && mlResult.probability !== null) {
                await storeArrivalForTraining(mlResult.features, mlResult.probability);
            }

            try {
                const weatherImpact = await getWeatherImpact(user.lat, user.lng);
                const stopSchedule = await getScheduleForStop(busId, stopId);
                const stopScheduleTimestamp = getScheduledTime(stopSchedule);
                const arrivalTimeMs = arrivalTime * 1000;
                const delayS = Math.round((arrivalTimeMs - stopScheduleTimestamp) / 1000);

                const scheduledTimeObj = new Date(stopScheduleTimestamp);
                const scheduledTime = scheduledTimeObj.toTimeString().split(' ')[0];

                const arrivalRecord = await storeArrival({
                    busId,
                    stopId,
                    scheduledTime: scheduledTime,
                    delaySeconds: delayS,
                    weather: weatherImpact.factors.weather_main,
                    trafficLevel: data.trafficLevel || null,
                    eventNearby: data.eventNearby || false,
                    arrivedAt: new Date(arrivalTimeMs)
                });

                console.log(`Arrival stored to database with ID: ${arrivalRecord.id}`);

                try {
                    const pendingPrediction = await getPendingPrediction(busId, stopId);
                    if (pendingPrediction) {
                        await logPredictionAccuracy(busId, stopId, arrivalTime, pendingPrediction);
                    }
                } catch (etaError) {
                    console.warn("Failed to log ETA prediction accuracy:", etaError.message);
                }

                const lastArrival = await getLastArrival(busId);
                if (lastArrival && lastArrival.stop_id !== stopId) {
                    const travelTime = Math.floor((arrivalTimeMs - new Date(lastArrival.arrived_at).getTime()) / 1000);

                    const bus = await getBusById(busId);
                    if (bus && bus.route_id && travelTime > 0 && travelTime < 7200) {
                        await updateSegmentTime({
                            routeId: bus.route_id,
                            fromStopId: lastArrival.stop_id,
                            toStopId: stopId,
                            travelSeconds: travelTime
                        });
                    }
                }
            } catch (dbError) {
                console.error("Error storing arrival to database:", dbError.message);
            }

            return {
                confirmed: true,
                message: `Arrival confirmed at ${arrivalTime}`,
                mlProbability: mlResult.probability,
                reportCount: reportCount
            }

        }

        if (mlResult.features && mlResult.probability !== null) {
            await storeArrivalForTraining(mlResult.features, mlResult.probability);
        }

        return {
            confirmed: false,
            message: `Insufficient validation: ${reportCount}/${MIN_REPORTS} reports, ML: ${mlResult.mlConfirmed}`,
            mlProbability: mlResult.probability,
            reportCount: reportCount
        }
    } catch (error) {
        console.log(error);
        return { confirmed: false }
    }
}

export const getReports = async (busId) => {
    try {
        const reportIds = await redis.zrevrange(`bus:${busId}:global_reports`, 0, 10);
        const reports = [];
        for (const id of reportIds) {
            const r = await redis.hgetall(`report:${id}`);
            if (r && Object.keys(r).length > 0) {
                reports.push({ ...r, upvotes: parseInt(r.upvotes || 1) });
            }
        }
        return reports;
    } catch (e) {
        console.error("Failed to get reports:", e);
        return [];
    }
}

export const upvoteReport = async (reportId, routeId) => {
    try {
        const newUpvotes = await redis.hincrby(`report:${reportId}`, "upvotes", 1);
        const io = getIO();
        io.to(`route:${routeId}`).emit("bus:report_upvote", { reportId, upvotes: newUpvotes });
        return { success: true, upvotes: newUpvotes };
    } catch (e) {
        console.error("Failed to upvote report:", e);
        return { success: false };
    }
}
