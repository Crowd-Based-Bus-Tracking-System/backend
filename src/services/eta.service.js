import redis from "../config/redis.js";
import BusProgressionService from "./busProgression.service.js";
import { getSegmentTimes } from "../models/segments.js";
import { getScheduleForStop } from "../models/shedule.js";
import { calculateSegmentTimeFromArrivals } from "../models/arrival.js";

class BaseEtaService {
    constructor() {
        this.busProgressionService = new BusProgressionService();
    }

    getNextScheduledTime(schedule) {
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

    getScheduledTime(schedule) {
        if (!schedule) return null;

        const now = new Date();
        const [hours, minutes, seconds] = schedule.sheduled_arrival_time.split(':').map(Number);

        const scheduledTime = new Date();
        scheduledTime.setHours(hours, minutes, seconds || 0, 0);

        return scheduledTime.getTime();
    }

    calculateConfidence(minutesSinceLastArrival) {
        if (minutesSinceLastArrival < 5) return 0.9;
        if (minutesSinceLastArrival < 10) return 0.7;
        if (minutesSinceLastArrival < 20) return 0.5;
        if (minutesSinceLastArrival < 30) return 0.3;
        return 0.1;
    }

    async calculateScheduleBasedETA(busId, targetStopId) {
        const lastConfirmedStop = await this.busProgressionService.getLastConfirmedStop(busId);
        const schedule = await getScheduleForStop(busId, targetStopId);

        if (!schedule) {
            return { eta_seconds: null, method: "no_schedule" };
        }

        const now = Date.now();
        const scheduledTime = this.getNextScheduledTime(schedule);
        const scheduledETA = (scheduledTime - now) / 1000;

        if (!lastConfirmedStop) {
            return {
                eta_seconds: Math.max(0, scheduledETA),
                method: "schedule_only",
                confidence: 0.2
            };
        }

        const lastStopSchedule = await getScheduleForStop(busId, lastConfirmedStop.stopId);
        const currentDelay = lastConfirmedStop.arrivedAt - this.getScheduledTime(lastStopSchedule);

        const eta_seconds = Math.max(0, (scheduledETA + currentDelay / 1000));

        return {
            eta_seconds,
            method: "schedule_with_delay",
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

        let totalTime = 0;
        let fromStopId = lastConfirmedStop.stopId;

        for (const stop of remainingStops) {
            const segmentTime = await this.getSegmentTime(fromStopId, stop.id);
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
            confidence: this.calculateConfidence(lastConfirmedStop.minutesSinceArrival)
        };
    }

    async getSegmentTime(fromStopId, toStopId) {
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
}

export default BaseEtaService;
