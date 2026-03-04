import { getBusesByRoute } from "../models/bus.js";
import { getBusStatus } from "../socket/emitters/bus-updates.js";
import { getStopById } from "../models/stops.js";
import { ETAFusionEngine } from "./eta.service.js";
import distanceInMeters from "../utils/geo.js";

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

                let nextStopEtaResult = null;
                if (status.estimatedPosition?.toStopId) {
                    try {
                        nextStopEtaResult = await etaFusionEngine.calculateFinalEta({
                            bus: { busId: bus.id, routeId },
                            targetStopId: status.estimatedPosition.toStopId,
                            location
                        });
                    } catch (e) {
                        console.error("Failed to calculate next stop ETA:", e);
                    }
                }

                const nextStopObj = status.estimatedPosition?.toStopId
                    ? await getStopById(status.estimatedPosition.toStopId)
                    : null;

                let calculatedSpeed = 0;
                if (status.status !== "AT_TERMINUS" && status.lastConfirmedStop && status.estimatedPosition) {
                    const lastStopObj = await getStopById(status.lastConfirmedStop.stopId);
                    if (lastStopObj && status.estimatedPosition.lat) {
                        const metersTraveled = distanceInMeters(
                            parseFloat(lastStopObj.latitude),
                            parseFloat(lastStopObj.longitude),
                            status.estimatedPosition.lat,
                            status.estimatedPosition.lng
                        );
                        const secondsElapsed = status.lastConfirmedStop.timeSinceArrival || 1;
                        calculatedSpeed = Math.round((metersTraveled / secondsElapsed) * 3.6);
                    }
                }

                if (calculatedSpeed > 100 || calculatedSpeed < 0) {
                    calculatedSpeed = 40;
                }

                if (calculatedSpeed === 0 && status.status !== "AT_TERMINUS" && status.status !== "At_STOP") {
                    calculatedSpeed = 15;
                }

                return {
                    busId: bus.id,
                    busNumber: bus.bus_number,
                    status: status.status,
                    speed: calculatedSpeed,
                    next_stop_name: nextStopObj?.name || "Unknown",
                    lastConfirmedStop: status.lastConfirmedStop || null,
                    estimatedPosition: status.estimatedPosition || null,
                    eta: {
                        eta_seconds: etaResult.eta_seconds,
                        eta_minutes: etaResult.eta_minutes,
                        next_stop_eta_minutes: nextStopEtaResult ? nextStopEtaResult.eta_minutes : 0,
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
                    speed: 0,
                    eta: { eta_seconds: Infinity, eta_minutes: Infinity, next_stop_eta_minutes: 0 }
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
