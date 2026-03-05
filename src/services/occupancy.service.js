import redis from "../config/redis.js";
import { checkDistance } from "../utils/check-distance.js";
import { storeReporterPosition, increaseReporterStatsOnReport, increaseReporterStatsOnConfirm } from "./reporter.service.js";
import { validateOccupancyWithML, storeOccupancyForTraining } from "./ml-occupancy-prediction/mlOccupancyIntegration.service.js";
import { storeOccupancy } from "../models/occupancy.js";
import { getWeatherImpact } from "./weather.service.js";
import { getIO } from "../socket/index.js";

const MIN_REPORTS = 3;
const MIN_REPORT_INTERVAL = 60 * 1000;
const OCCUPANCY_EXPIRATION = 300;
const RADIUS_MIN_METERS = 999999999999999999999999;

export const reportOccupancy = async (data) => {
    const {
        bus: { busId, routeId },
        stopId,
        occupancyLevel,
        reportTime,
        user
    } = data;

    try {
        const res = await checkDistance(stopId, user.lat, user.lng, RADIUS_MIN_METERS);
        if (!res.confirmed) return res;

        const reportKey = `bus:${busId}:occupancy_reports:${stopId}`;
        const confirmedKey = `bus:${busId}:occupancy:${stopId}:confirmed`;

        if (await redis.exists(confirmedKey)) {
            return { confirmed: false, message: "Occupancy already reported for this stop" };
        }

        await storeReporterPosition({ busId, stopId, arrivalTime: reportTime, user });
        await increaseReporterStatsOnReport(user.id);

        const cutoff = reportTime - MIN_REPORT_INTERVAL;

        const multi = redis.multi();
        multi.zadd(reportKey, reportTime, `${user.id}:${occupancyLevel}`);
        multi.zremrangebyscore(reportKey, 0, cutoff);
        multi.zcard(reportKey);
        multi.expire(reportKey, 120);
        const replies = await multi.exec();
        const reportCount = replies[2][1];

        const allMembers = await redis.zrange(reportKey, 0, -1);
        const reportedLevels = allMembers.map(m => parseInt(m.split(":")[1])).filter(n => !isNaN(n));
        reportedLevels.sort((a, b) => a - b);
        const medianLevel = reportedLevels.length > 0
            ? reportedLevels[Math.floor(reportedLevels.length / 2)]
            : occupancyLevel;

        const io = getIO();

        const reportPayload = {
            id: `occ_${Date.now()}_${user.id}`,
            busId,
            stopId,
            occupancyLevel: medianLevel,
            reporterLevel: occupancyLevel,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp_ms: Date.now(),
            reportCount
        };

        try {
            await redis.hset(`occupancy_report:${reportPayload.id}`, {
                ...reportPayload,
                occupancyLevel: String(reportPayload.occupancyLevel),
                reporterLevel: String(reportPayload.reporterLevel),
                reportCount: String(reportPayload.reportCount),
                timestamp_ms: String(reportPayload.timestamp_ms)
            });
            await redis.expire(`occupancy_report:${reportPayload.id}`, 86400);
            await redis.zadd(`bus:${busId}:occupancy_global_reports`, Date.now(), reportPayload.id);

            io.to(`route:${routeId}`).emit("bus:occupancy_report", reportPayload);
        } catch (e) {
            console.warn("Failed to cache or broadcast occupancy report:", e.message);
        }

        const mlResult = await validateOccupancyWithML(data, reportKey);

        if (mlResult.mlConfirmed !== null) {
            console.log(`ML occupancy prediction: ${mlResult.mlConfirmed ? "CONFIRM" : "REJECT"} (probability: ${mlResult.probability?.toFixed(3)})`);
        }

        const shouldConfirm = reportCount >= MIN_REPORTS && mlResult.mlConfirmed === true;

        console.log(`Occupancy Validation: Reports=${reportCount}/${MIN_REPORTS}, ML=${mlResult.mlConfirmed}, Confirm=${shouldConfirm}`);

        if (shouldConfirm) {
            await redis.set(confirmedKey, true, "EX", OCCUPANCY_EXPIRATION);

            await redis.hset(`bus:${busId}:current_occupancy`, {
                level: String(medianLevel),
                stopId: String(stopId),
                confirmedAt: String(Date.now()),
                reportCount: String(reportCount)
            });
            await redis.expire(`bus:${busId}:current_occupancy`, 86400);

            io.to(`bus:${busId}`).emit("bus:occupancy", {
                busId, stopId, occupancyLevel: medianLevel,
                reportCount, confirmedAt: Date.now()
            });
            io.to(`route:${routeId}`).emit("bus:occupancy_confirmed", {
                busId, stopId, occupancyLevel: medianLevel,
                reportCount, confirmedAt: Date.now()
            });

            const members = await redis.zrange(reportKey, 0, -1);
            for (const member of members) {
                const reporterId = member.split(":")[0];
                await increaseReporterStatsOnConfirm(reporterId);
            }

            if (mlResult.features && mlResult.probability !== null) {
                await storeOccupancyForTraining(mlResult.features, mlResult.probability);
            }

            try {
                const now = new Date();
                const weatherImpact = await getWeatherImpact(user.lat, user.lng);
                const hourOfDay = now.getHours();
                const dayOfWeek = now.getDay();
                const isRushHour = (hourOfDay >= 7 && hourOfDay < 10) || (hourOfDay >= 17 && hourOfDay < 20);

                await storeOccupancy({
                    busId, stopId,
                    occupancyLevel: medianLevel,
                    reporterCount: reportCount,
                    avgReporterAccuracy: mlResult.features?.acc_mean || 0.5,
                    scheduledTime: now.toTimeString().split(' ')[0],
                    weather: weatherImpact.factors.weather_main,
                    trafficLevel: data.trafficLevel || null,
                    hourOfDay, dayOfWeek, isRushHour
                });
                console.log(`Occupancy stored to database: bus ${busId}, level ${medianLevel}`);
            } catch (dbError) {
                console.error("Error storing occupancy to database:", dbError.message);
            }

            return {
                confirmed: true,
                occupancyLevel: medianLevel,
                message: `Occupancy confirmed: level ${medianLevel}`,
                mlProbability: mlResult.probability,
                reportCount
            };
        }

        if (mlResult.features && mlResult.probability !== null) {
            await storeOccupancyForTraining(mlResult.features, mlResult.probability);
        }

        return {
            confirmed: false,
            message: `Insufficient validation: ${reportCount}/${MIN_REPORTS} reports, ML: ${mlResult.mlConfirmed}`,
            mlProbability: mlResult.probability,
            reportCount
        };
    } catch (error) {
        console.error("Occupancy report error:", error);
        return { confirmed: false };
    }
};

export const getCurrentOccupancy = async (busId) => {
    const data = await redis.hgetall(`bus:${busId}:current_occupancy`);
    if (!data || !data.level) return null;
    return {
        level: parseInt(data.level),
        stopId: parseInt(data.stopId),
        confirmedAt: parseInt(data.confirmedAt),
        reportCount: parseInt(data.reportCount)
    };
};

export const getOccupancyReports = async (busId) => {
    try {
        const twentyFourHoursAgo = Date.now() - 86400000;
        await redis.zremrangebyscore(`bus:${busId}:occupancy_global_reports`, 0, twentyFourHoursAgo);

        const reportIds = await redis.zrevrange(`bus:${busId}:occupancy_global_reports`, 0, 50);
        const reports = [];
        for (const id of reportIds) {
            const r = await redis.hgetall(`occupancy_report:${id}`);
            if (r && Object.keys(r).length > 0) {
                reports.push({
                    ...r,
                    occupancyLevel: parseInt(r.occupancyLevel || 0),
                    reportCount: parseInt(r.reportCount || 1)
                });
            } else {
                await redis.zrem(`bus:${busId}:occupancy_global_reports`, id);
            }
        }
        return reports;
    } catch (e) {
        console.error("Failed to get occupancy reports:", e);
        return [];
    }
};
