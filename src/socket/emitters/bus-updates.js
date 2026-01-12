import { getIO } from "..";
import redis from "../../config/redis"
import { getStopById } from "../../models/stops";
import { getSegmentTime } from "../../utils/eta-helpers";


export const getBusStatus = async (busId, routeId) => {
    const lastStopId = await redis.get(`bus:${busId}:last_stop`);
    const lastArrivalTime = await redis.get(`bus:${busId}:last_arrival_time`);

    if (!lastStopId || !lastArrivalTime) {
        return { busId, status: "UNKNOWN", message: "No recent data" };
    }

    const lastStop = await getStopById(lastStopId);
    const timeSinceLastArrival = Date.now() - parseInt(lastArrivalTime);
    const nextStopId = parseInt(lastStopId + 1);

    const expectedSegmentTime = await getSegmentTime(
        parseInt(lastStopId),
        nextStopId,
        routeId,
    ) * 1000;

    const segmentProgress = Math.min(1, timeSinceLastArrival / expectedSegmentTime);

    return {
        busId,
        routeId,
        status: segmentProgress < 0.1 ? "At_STOP" : "IN_TRANSIT",
        lastConfirmedStop: {
            stopId: parseInt(lastStopId),
            stopName: lastStop?.name || "Unknown",
            arrivedAt: parseInt(lastArrivalTime),
            timeSinceArrival: Math.round(timeSinceLastArrival / 1000)
        },
        estimatedPosition: {
            fromStopId: parseInt(lastStopId),
            toStopId: nextStopId,
            segmentProgress: Math.round(segmentProgress * 100) / 100
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
    const io = getIO;
    
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
    const io = getIO;
    const status = await getBusStatus(busId, routeId);
    io.to(`bus:${busId}`).emit("bus:position", status);
}