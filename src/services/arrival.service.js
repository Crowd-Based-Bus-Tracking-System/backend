import redis from "../config/redis.js";
import { checkDistance } from "../utils/check-distance.js";
import { storeReporterPosition } from "./reporter.service.js";


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
    const RADIUS_MIN_METERS = 40;

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
        if (replies[2] >= MIN_REPORTS) {
            await redis.set(confirmedKey, true, "EX", ARRIVAL_EXPIRATION);

            await redis.set(`bus:${busId}:last_stop`, stopId.toString());
            await redis.set(`bus:${busId}:last_arrival_time`, arrivalTime.toString());

            // await save_arrval({ busId, stopId, arrivalTime });

            return {
                confirmed: true,
                message: `Arrival confirmed at ${arrivalTime}`
            }
        }
        return { confirmed: false }
    } catch (error) {
        console.log(error);
        return { confirmed: false }
    }
}