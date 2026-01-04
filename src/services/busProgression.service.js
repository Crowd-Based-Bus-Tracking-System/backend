import redis from "../config/redis.js";
import { getRouteStops } from "../models/route.js";


class BusProgressionService {
    async getLastConfirmedStop(busId) {
        const lastStopId = await redis.get(`bus:${busId}:last_stop`);
        const lastArrivalTime = await redis.get(`bus:${busId}:last_arrival_time`);

        if (!lastStopId || !lastArrivalTime) {
            return null;
        }

        return {
            stopId: parseInt(lastStopId),
            arrivedAt: parseInt(lastArrivalTime),
            minutesSinceArrival: (Date.now() - parseInt(lastArrivalTime)) / 60000
        };
    }


    async getRemainingStops(busId, targetStopId) {
        const routeStops = await getRouteStops(busId);
        const lastConfirmedStop = await this.getLastConfirmedStop(busId);

        const targetStopIndex = routeStops.findIndex(s => s.id === targetStopId);

        if (!lastConfirmedStop) {
            return routeStops.slice(0, targetStopIndex + 1);
        }

        const lastStopIndex = routeStops.findIndex(s => s.id === lastConfirmedStop.stopId);

        if (targetStopIndex <= lastStopIndex) {
            return [];
        }

        return routeStops.slice(lastStopIndex + 1, targetStopIndex + 1);
    }


    async isStale(busId, maxMinutesSinceArrival = 30) {
        const lastConfirmedStop = await this.getLastConfirmedStop(busId);
        if (!lastConfirmedStop) return true;

        return lastConfirmedStop.minutesSinceArrival > maxMinutesSinceArrival;
    }
}


export default BusProgressionService;