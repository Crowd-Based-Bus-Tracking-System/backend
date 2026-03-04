import { getBusesByRoute } from "../models/bus.js";
import { getBusStatus } from "../socket/emitters/bus-updates.js";
import { getStopById } from "../models/stops.js";
import { ETAFusionEngine } from "./eta.service.js";

const etaFusionEngine = new ETAFusionEngine();

export const getRouteBusesSortedByETA = async (routeId, targetStopId, location) => {
    const buses = await getBusesByRoute(routeId);

    if (!buses || buses.length === 0) {
        return { routeId, buses: [], message: "No active buses on this route" };
    }

    const busETAs = await Promise.allSettled(
        buses.map(async (bus) => {
            try {
                const status = await getBusStatus(bus.id, routeId);

                let etaResult;
                if (targetStopId) {
                    etaResult = await etaFusionEngine.calculateFinalEta({
                        bus: { busId: bus.id, routeId },
                        targetStopId,
                        location
                    });
                } else {
                    etaResult = {
                        eta_seconds: Infinity,
                        eta_minutes: Infinity,
                        arrival_time: null,
                        confidence: 0,
                        methods_used: [],
                        uncertainty_range: { min: Infinity, max: Infinity }
                    };
                }

                const nextStopObj = status.estimatedPosition?.toStopId
                    ? await getStopById(status.estimatedPosition.toStopId)
                    : null;

                return {
                    busId: bus.id,
                    busNumber: bus.bus_number,
                    status: status.status,
                    next_stop_name: nextStopObj?.name || "Unknown",
                    lastConfirmedStop: status.lastConfirmedStop || null,
                    estimatedPosition: status.estimatedPosition || null,
                    eta: {
                        eta_seconds: etaResult.eta_seconds,
                        eta_minutes: etaResult.eta_minutes,
                        arrival_time: etaResult.arrival_time,
                        confidence: etaResult.confidence,
                        methods_used: etaResult.methods_used,
                        uncertainty_range: etaResult.uncertainty_range,
                        is_passed: etaResult.is_passed || false
                    }
                };
            } catch (error) {
                console.warn(`Failed to get ETA for bus ${bus.id}:`, error.message);
                return {
                    busId: bus.id,
                    busNumber: bus.bus_number,
                    status: "ERROR",
                    eta: { eta_seconds: Infinity, eta_minutes: Infinity }
                };
            }
        })
    );

    const resolvedBuses = busETAs
        .filter(r => r.status === "fulfilled" && !r.value.eta.is_passed)
        .map(r => r.value)
        .sort((a, b) => a.eta.eta_seconds - b.eta.eta_seconds);

    return {
        routeId,
        targetStopId,
        busCount: resolvedBuses.length,
        buses: resolvedBuses,
        timestamp: Date.now()
    };
};
