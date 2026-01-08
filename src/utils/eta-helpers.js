import redis from "../config/redis.js";
import { getSegmentTimes } from "../models/segments.js";
import { calculateSegmentTimeFromArrivals } from "../models/arrival.js";


export function getScheduledTime(schedule) {
    if (!schedule) return null;

    const now = new Date();
    const [hours, minutes, seconds] = schedule.sheduled_arrival_time.split(':').map(Number);

    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, seconds || 0, 0);

    return scheduledTime.getTime();
}

export function getNextScheduledTime(schedule) {
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

export async function getSegmentTime(fromStopId, toStopId) {
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

export function calculateConfidence(minutesSinceLastArrival) {
    if (minutesSinceLastArrival < 5) return 0.9;
    if (minutesSinceLastArrival < 10) return 0.7;
    if (minutesSinceLastArrival < 20) return 0.5;
    if (minutesSinceLastArrival < 30) return 0.3;
    return 0.1;
}
