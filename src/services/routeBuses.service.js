import { getBusesByRoute } from "../models/bus.js";
import { getBusStatus } from "../socket/emitters/bus-updates.js";
import { getStopById } from "../models/stops.js";
import { ETAFusionEngine } from "./eta.service.js";
import distanceInMeters from "../utils/geo.js";
import { getCurrentOccupancy } from "./occupancy.service.js";
import redis from "../config/redis.js";


async function deriveScheduledPosition(routeEtas, allRouteStops) {
    if (!routeEtas || routeEtas.length === 0) return null;

    let lastPassedEntry = null;
    let nextUpcomingEntry = null;

    for (const entry of routeEtas) {
        if (entry.is_passed) {
            lastPassedEntry = entry;
        } else {
            nextUpcomingEntry = entry;
            break;
        }
    }

    if (!lastPassedEntry && nextUpcomingEntry) {
        const firstStop = allRouteStops.find(s => s.id === nextUpcomingEntry.stop_id);
        if (firstStop) {
            return {
                lat: parseFloat(firstStop.latitude),
                lng: parseFloat(firstStop.longitude),
                fromStopId: null,
                toStopId: nextUpcomingEntry.stop_id
            };
        }
        return null;
    }

    if (lastPassedEntry && !nextUpcomingEntry) {
        const lastStop = allRouteStops.find(s => s.id === lastPassedEntry.stop_id);
        if (lastStop) {
            return {
                lat: parseFloat(lastStop.latitude),
                lng: parseFloat(lastStop.longitude),
                fromStopId: lastPassedEntry.stop_id,
                toStopId: null
            };
        }
        return null;
    }

    const [fromStop, toStop] = await Promise.all([
        getStopById(lastPassedEntry.stop_id),
        getStopById(nextUpcomingEntry.stop_id)
    ]);

    if (!fromStop || !toStop) return null;

    const segmentDist = distanceInMeters(
        parseFloat(fromStop.latitude), parseFloat(fromStop.longitude),
        parseFloat(toStop.latitude), parseFloat(toStop.longitude)
    );

    const fromIdx = routeEtas.findIndex(e => e.stop_id === lastPassedEntry.stop_id);
    const prevEntry = fromIdx > 0 ? routeEtas[fromIdx - 1] : null;
    const nextEta = nextUpcomingEntry.eta_seconds ?? 0;

    const toIdx = routeEtas.findIndex(e => e.stop_id === nextUpcomingEntry.stop_id);
    const afterEntry = toIdx >= 0 && toIdx + 1 < routeEtas.length ? routeEtas[toIdx + 1] : null;

    const adjacentSegmentSecs = afterEntry && afterEntry.eta_seconds > nextEta
        ? (afterEntry.eta_seconds - nextEta)
        : null;
    const segmentTotalSecs = adjacentSegmentSecs ?? Math.max(60, segmentDist / 8);

    const elapsed = Math.max(0, segmentTotalSecs - nextEta);
    const progress = segmentTotalSecs > 0 ? Math.min(1, elapsed / segmentTotalSecs) : 0.5;

    const lat = parseFloat(fromStop.latitude) + (parseFloat(toStop.latitude) - parseFloat(fromStop.latitude)) * progress;
    const lng = parseFloat(fromStop.longitude) + (parseFloat(toStop.longitude) - parseFloat(fromStop.longitude)) * progress;

    return {
        lat,
        lng,
        fromStopId: lastPassedEntry.stop_id,
        toStopId: nextUpcomingEntry.stop_id,
        progress
    };
}

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
                const occupancyData = await getCurrentOccupancy(bus.id);

                let etaResult;
                if (targetStopId) {
                    if (status.lastConfirmedStop) {
                        const cachedRouteEtaKey = `route_eta:${bus.id}`;
                        const cachedRouteEta = await redis.get(cachedRouteEtaKey);

                        if (cachedRouteEta) {
                            try {
                                const parsedEta = JSON.parse(cachedRouteEta);
                                const stopEta = parsedEta.find(s => s.stop_id === targetStopId);

                                if (stopEta) {
                                    const freshEtaResult = await etaFusionEngine.calculateFinalEta({
                                        bus: { busId: bus.id, routeId },
                                        targetStopId,
                                        location
                                    });

                                    const cachedMinutes = stopEta.eta_minutes;
                                    const freshMinutes = freshEtaResult.eta_minutes;

                                    if (Math.abs(cachedMinutes - freshMinutes) > 5) {
                                        console.warn(`Stale cache detected for bus ${bus.id}: cached=${cachedMinutes}m, fresh=${freshMinutes}m`);
                                        await redis.del(cachedRouteEtaKey);

                                        etaResult = freshEtaResult;
                                    } else {
                                        etaResult = {
                                            eta_seconds: stopEta.eta_seconds,
                                            eta_minutes: stopEta.eta_minutes,
                                            route_etas: parsedEta,
                                            next_stop_eta_minutes: 0,
                                            arrival_time: stopEta.arrival_time,
                                            confidence: stopEta.confidence || 0.5,
                                            methods_used: stopEta.methods_used || [{ method: 'cache_hit', eta: stopEta.eta_seconds }],
                                            uncertainty_range: stopEta.uncertainty_range || { min: stopEta.eta_seconds * 0.9, max: stopEta.eta_seconds * 1.1 },
                                            is_passed: stopEta.is_passed || false
                                        };
                                    }
                                } else {
                                    etaResult = {
                                        eta_seconds: Infinity,
                                        eta_minutes: Infinity,
                                        route_etas: [],
                                        next_stop_eta_minutes: 0,
                                        arrival_time: null,
                                        confidence: 0,
                                        methods_used: [{ method: 'cache_miss', eta: Infinity }],
                                        uncertainty_range: { min: Infinity, max: Infinity },
                                        is_passed: false
                                    };
                                }
                            } catch (parseError) {
                                console.warn(`Failed to parse cached route ETA for bus ${bus.id}:`, parseError.message);
                                etaResult = {
                                    eta_seconds: Infinity,
                                    eta_minutes: Infinity,
                                    route_etas: [],
                                    next_stop_eta_minutes: 0,
                                    arrival_time: null,
                                    confidence: 0,
                                    methods_used: [{ method: 'cache_error', eta: Infinity }],
                                    uncertainty_range: { min: Infinity, max: Infinity },
                                    is_passed: false
                                };
                            }
                        } else {
                            etaResult = await etaFusionEngine.calculateFinalEta({
                                bus: { busId: bus.id, routeId },
                                targetStopId,
                                location
                            });
                        }
                    } else {
                        etaResult = await etaFusionEngine.calculateFinalEta({
                            bus: { busId: bus.id, routeId },
                            targetStopId,
                            location
                        });
                    }
                } else {
                    etaResult = await etaFusionEngine.calculateFinalEta({
                        bus: { busId: bus.id, routeId },
                        targetStopId: null,
                        location
                    });
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

                const isScheduledMethod = ['schedule_active', 'waiting_for_trip'].includes(
                    etaResult.methods_used?.[0]?.method
                );

                let resolvedEstimatedPosition = status.estimatedPosition || null;

                if (isScheduledMethod && etaResult.route_etas?.length > 0) {
                    try {
                        const stopIds = etaResult.route_etas.map(e => e.stop_id);
                        const stopObjs = await Promise.all(stopIds.map(id => getStopById(id).catch(() => null)));
                        const allRouteStopsForPos = stopObjs
                            .filter(Boolean)
                            .map(s => ({ id: s.id, latitude: s.latitude, longitude: s.longitude }));

                        const scheduledPos = await deriveScheduledPosition(etaResult.route_etas, allRouteStopsForPos);
                        if (scheduledPos) {
                            resolvedEstimatedPosition = {
                                lat: scheduledPos.lat,
                                lng: scheduledPos.lng,
                                fromStopId: scheduledPos.fromStopId,
                                toStopId: scheduledPos.toStopId,
                                isScheduled: true
                            };
                        }
                    } catch (e) {
                        console.warn(`Scheduled position derivation failed for bus ${bus.id}:`, e.message);
                    }
                }

                const nextStopObj = resolvedEstimatedPosition?.toStopId
                    ? await getStopById(resolvedEstimatedPosition.toStopId)
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
                    isSimulated: status.isSimulated || false,
                    speed: calculatedSpeed,
                    occupancyLevel: occupancyData?.level || 1,
                    next_stop_name: nextStopObj?.name || "Unknown",
                    lastConfirmedStop: status.lastConfirmedStop || null,
                    estimatedPosition: resolvedEstimatedPosition,
                    eta: {
                        eta_seconds: etaResult.eta_seconds,
                        eta_minutes: etaResult.eta_minutes,
                        route_etas: etaResult.route_etas,
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
        .filter(r => {
            if (r.status !== "fulfilled") return false;
            if (targetStopId && r.value.eta.is_passed) {
                return false;
            }
            return true;
        })
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