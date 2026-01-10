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

export async function getSegmentTime(fromStopId, toStopId, routeId = null) {
    const cacheKey = routeId
        ? `segment:${routeId}:${fromStopId}:${toStopId}`
        : `segment:${fromStopId}:${toStopId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
        return parseInt(cached);
    }

    let segmentTimeAvg = null;
    let arrivalTimeAvg = null;

    if (routeId) {
        const result = await getSegmentTimes(fromStopId, toStopId, routeId);
        if (result.length > 0) {
            segmentTimeAvg = result[0].avg_travel_seconds;
        }
    } else {
        const result = await getSegmentTimes(fromStopId, toStopId);
        if (result.length > 0) {
            segmentTimeAvg = result[0].avg_travel_seconds;
        }
    }

    arrivalTimeAvg = await calculateSegmentTimeFromArrivals(fromStopId, toStopId, routeId);

    let finalTime;
    if (segmentTimeAvg && arrivalTimeAvg) {
        finalTime = Math.round(arrivalTimeAvg * 0.8 + segmentTimeAvg * 0.2);
    } else if (segmentTimeAvg) {
        finalTime = segmentTimeAvg;
    } else if (arrivalTimeAvg) {
        finalTime = arrivalTimeAvg;
    } else {
        finalTime = 300;
    }

    await redis.setex(cacheKey, 3600, finalTime);

    return finalTime;
}

export function calculateConfidence(minutesSinceLastArrival) {
    if (minutesSinceLastArrival < 5) return 0.9;
    if (minutesSinceLastArrival < 10) return 0.7;
    if (minutesSinceLastArrival < 20) return 0.5;
    if (minutesSinceLastArrival < 30) return 0.3;
    return 0.1;
}
