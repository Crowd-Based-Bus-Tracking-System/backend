import redis from "../config/redis.js";
import { checkDistance } from "../utils/check-distance.js";
import { storeReporterPosition, increaseReporterStatsOnReport, increaseReporterStatsOnConfirm } from "./reporter.service.js";
import { validateArrivalWithML, storeArrivalForTraining } from "./ml-arrival-confirmation/mlArrivalIntegration.service.js";
import { storeArrival, updateSegmentTime, getLastArrival } from "../models/arrival.js";
import { getBusById } from "../models/bus.js";
import { getWeatherImpact } from "./weather.service.js";
import { getScheduleForStop } from "../models/shedule.js";
import BaseEtaService from "./eta.service.js";

const baseEtaService = new BaseEtaService();

export const reportArrival = async (data) => {
    const {
        busId,
        stopId,
        arrivalTime,
        user
    } = data;

    const MIN_REPORTS = 3;
    const MIN_REPORT_INTERVAL = 60 * 1000;
    const ARRIVAL_EXPIRATION = 300;
    const RADIUS_MIN_METERS = 30000;

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

        const mlResult = await validateArrivalWithML(data, reportKey);

        if (mlResult.mlConfirmed !== null) {
            console.log(`ML prediction: ${mlResult.mlConfirmed ? "CONFIRM" : "REJECT"} (probability: ${mlResult.probability?.toFixed(3)})`);
        }

        const shouldConfirm = reportCount >= MIN_REPORTS && mlResult.mlConfirmed === true;

        console.log(`Validation: Reports=${reportCount}/${MIN_REPORTS}, ML=${mlResult.mlConfirmed}, Confirm=${shouldConfirm}`);

        if (shouldConfirm) {
            await redis.set(confirmedKey, true, "EX", ARRIVAL_EXPIRATION);

            await redis.set(`bus:${busId}:last_stop`, stopId.toString());
            await redis.set(`bus:${busId}:last_arrival_time`, arrivalTime.toString());

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
                const stopScheduleTime = baseEtaService.getScheduledTime(stopSchedule);
                const delayS = arrivalTime - stopScheduleTime;

                const arrivalRecord = await storeArrival({
                    busId,
                    stopId,
                    scheduledTime: stopScheduleTime,
                    delaySeconds: delayS,
                    weather: weatherImpact.factors.weather_main,
                    trafficLevel: data.trafficLevel || null,
                    eventNearby: data.eventNearby || false,
                    arrivedAt: arrivalTime
                });

                console.log(`Arrival stored to database with ID: ${arrivalRecord.id}`);

                const lastArrival = await getLastArrival(busId);
                if (lastArrival && lastArrival.stop_id !== stopId) {
                    const travelTime = Math.floor((arrivalTime - new Date(lastArrival.arrived_at).getTime()) / 1000);

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
