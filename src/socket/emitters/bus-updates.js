import { getIO } from "../index.js";
import redis from "../../config/redis.js"
import { getStopById, getRouteStops } from "../../models/stops.js";
import { getSegmentTime } from "../../utils/eta-helpers.js";


export const getBusStatus = async (busId, routeId) => {
    const lastStopId = await redis.get(`bus:${busId}:last_stop`);
    const lastArrivalTime = await redis.get(`bus:${busId}:last_arrival_time`);

    if (!lastStopId || !lastArrivalTime) {
        return { busId, status: "UNKNOWN", message: "No recent data" };
    }

    const routeStops = await getRouteStops(routeId);

    const lastStopIndex = routeStops.findIndex(s => s.id === parseInt(lastStopId));

    if (lastStopIndex === -1) {
        return { busId, status: "UNKNOWN", message: "Last stop not found in route" };
    }

    const lastStop = routeStops[lastStopIndex];
    const lastArrivalTimeMs = parseInt(lastArrivalTime) * 1000;
    const timeSinceLastArrival = Date.now() - lastArrivalTimeMs;

    let nextStopId = null;
    let expectedSegmentTime = 0;
    let nextStop = null;

    if (lastStopIndex + 1 < routeStops.length) {
        nextStop = routeStops[lastStopIndex + 1];
        nextStopId = nextStop.id;
        expectedSegmentTime = await getSegmentTime(
            parseInt(lastStopId),
            nextStopId,
            routeId,
        ) * 1000;
    } else {
        return {
            busId,
            routeId,
            status: "AT_TERMINUS",
            lastConfirmedStop: {
                stopId: parseInt(lastStopId),
                stopName: lastStop?.name || "Unknown",
                arrivedAt: lastArrivalTimeMs,
                timeSinceArrival: Math.round(timeSinceLastArrival / 1000)
            },
            estimatedPosition: {
                fromStopId: parseInt(lastStopId),
                toStopId: parseInt(lastStopId),
                segmentProgress: 1,
                lat: parseFloat(lastStop.latitude),
                lng: parseFloat(lastStop.longitude)
            },
            lastUpdate: Date.now()
        };
    }

    const segmentProgress = expectedSegmentTime > 0 ? Math.min(1, timeSinceLastArrival / expectedSegmentTime) : 1;

    const lat = parseFloat(lastStop.latitude) + (parseFloat(nextStop.latitude) - parseFloat(lastStop.latitude)) * segmentProgress;
    const lng = parseFloat(lastStop.longitude) + (parseFloat(nextStop.longitude) - parseFloat(lastStop.longitude)) * segmentProgress;

    return {
        busId,
        routeId,
        status: segmentProgress < 0.1 ? "At_STOP" : "IN_TRANSIT",
        lastConfirmedStop: {
            stopId: parseInt(lastStopId),
            stopName: lastStop?.name || "Unknown",
            arrivedAt: lastArrivalTimeMs,
            timeSinceArrival: Math.round(timeSinceLastArrival / 1000)
        },
        estimatedPosition: {
            fromStopId: parseInt(lastStopId),
            toStopId: nextStopId,
            segmentProgress: Math.round(segmentProgress * 100) / 100,
            lat,
            lng
        },
        lastUpdate: Date.now()
    };
};


export const emitBusArrival = async (busId, stopId, arrivalTime) => {
    const io = getIO();
    const stop = getStopById(stopId);

    io.to(`bus:${busId}`).emit("bus:arrival", {
        busId,
        stopId,
        stopName: stop?.name || "Unknown",
        arrivedAt: arrivalTime,
        timestamp: Date.now()
    });
}


export const emitBusETA = async (busId, targetStopId, etaData) => {
    const io = getIO();

    io.to(`bus:${busId}`).emit("bus:eta", {
        busId,
        targetStopId,
        eta_seconds: etaData.eta_seconds,
        eta_minutes: etaData.eta_minutes,
        confidence: etaData.confidence,
        arrival_time: etaData.arrival_time,
        timestamp: Date.now()
    });
}


export const emitBusPosition = async (busId, routeId) => {
    const io = getIO();
    const status = await getBusStatus(busId, routeId);
    io.to(`bus:${busId}`).emit("bus:position", status);
}


export const emitRouteBusesUpdate = (routeId, busesData) => {
    const io = getIO();
    io.to(`route:${routeId}`).emit("route:buses", busesData);
}
