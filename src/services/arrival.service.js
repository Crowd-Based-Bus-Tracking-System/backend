import redis from "../config/redis";
import { checkDistance } from "../utils/check-distance";


const MIN_REPORTS = 3;
const MIN_REPORT_INTERVAL = 60 * 1000;
const ARRIVAL_EXPIRATION = 300;
const RADIUS_MIN_METERS = 40;

export async function reportArrival  (data) {
    const {
        busId,
        stopId,
        arrivalTime,
        user
    } = data;
    
    try {
        const res = await checkDistance(stopId, user.lat, user.lng, RADIUS_MIN_METERS);
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

        const cutoff = arrivalTime - MIN_REPORT_INTERVAL;

        await redis.zadd(reportKey, {
            score: arrivalTime,
            member: user.id
        });
        await redis.zremrangebyscore(reportKey, 0, cutoff);
        await redis.expire(reportKey, 120);

        const count = await redis.zcard(reportKey);
        if (count >= MIN_REPORTS) {
            await redis.set(confirmedKey, true, "EX", ARRIVAL_EXPIRATION);
            
            await redis.set(`bus:${busId}:last_stop:${stopId}`);
            await redis.set(`bus:${busId}:last_arrival_time`, arrivalTime);

            await save_arrval({ busId, stopId, arrivalTime });

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