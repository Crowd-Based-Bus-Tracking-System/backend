import redis from "../config/redis.js";
import { getBusById } from "../models/bus.js";
import { getRouteStops } from "../models/route.js";
class BusProgressionService {
    async getLastConfirmedStop(busId) {
        const lastStopId = await redis.get(`bus:${busId}:last_stop`);
        const lastArrivalTime = await redis.get(`bus:${busId}:last_arrival_time`);

        if (!lastStopId || !lastArrivalTime) {
            const bus = await getBusById(busId);
            if (!bus || !bus.route_id) return null;

            const { getSimulatedBusStatus } = await import("../socket/emitters/bus-updates.js");
            const simulatedStatus = await getSimulatedBusStatus(busId, bus.route_id);
            if (simulatedStatus && simulatedStatus.status !== "AT_TERMINUS" && simulatedStatus.lastConfirmedStop) {
                return {
                    stopId: simulatedStatus.lastConfirmedStop.stopId,
                    arrivedAt: simulatedStatus.lastConfirmedStop.arrivedAt,
                    minutesSinceArrival: simulatedStatus.lastConfirmedStop.timeSinceArrival / 60
                };
            }
            return null;
        }

        const arrivedAtMs = parseInt(lastArrivalTime) * 1000;
        return {
            stopId: parseInt(lastStopId),
            arrivedAt: arrivedAtMs,
            minutesSinceArrival: (Date.now() - arrivedAtMs) / 60000
        };
    }


    async getRemainingStops(busId, targetStopId) {
        try {
            const bus = await getBusById(busId);
            if (!bus || !bus.route_id) return [];

            const routeStops = await getRouteStops(busId);

            if (!Array.isArray(routeStops) || routeStops.length === 0) {
                console.warn(`No route stops found for bus ${busId}`);
                return [];
            }

            const lastConfirmedStop = await this.getLastConfirmedStop(busId);

            const targetStopIndex = targetStopId
                ? routeStops.findIndex(s => s.id === targetStopId)
                : routeStops.length - 1;

            if (targetStopIndex === -1 && targetStopId) {
                console.warn(`Target stop ${targetStopId} not found in route for bus ${busId}`);
                return [];
            }

            if (!lastConfirmedStop) {
                return routeStops.slice(0, targetStopIndex + 1);
            }

            const lastStopIndex = routeStops.findIndex(s => s.id === lastConfirmedStop.stopId);

            if (targetStopIndex <= lastStopIndex) {
                return [];
            }

            return routeStops.slice(lastStopIndex + 1, targetStopIndex + 1);
        } catch (error) {
            console.error(`Error getting remaining stops for bus ${busId}:`, error.message);
            return [];
        }
    }

    async getRecentStops(busId, limit = 4) {
        try {
            const bus = await getBusById(busId);
            if (!bus || !bus.route_id) return [];

            const routeStops = await getRouteStops(busId);

            if (!Array.isArray(routeStops) || routeStops.length === 0) {
                console.warn(`No route stops found for bus ${busId}`);
                return [];
            }

            const lastConfirmedStop = await this.getLastConfirmedStop(busId);

            if (!lastConfirmedStop) return [];

            const lastStopIndex = routeStops.findIndex(s => s.id === lastConfirmedStop.stopId);

            if (lastStopIndex === -1) {
                console.warn(`Last confirmed stop ${lastConfirmedStop.stopId} not found in route for bus ${busId}`);
                return [];
            }

            const recentStops = routeStops.slice(Math.max(lastStopIndex - limit + 1, 0), lastStopIndex + 1);

            return recentStops;
        } catch (error) {
            console.error(`Error getting recent stops for bus ${busId}:`, error.message);
            return [];
        }
    }

    async isStale(busId, maxMinutesSinceArrival = 30) {
        const lastConfirmedStop = await this.getLastConfirmedStop(busId);
        if (!lastConfirmedStop) return true;

        return lastConfirmedStop.minutesSinceArrival > maxMinutesSinceArrival;
    }
}


export default BusProgressionService;