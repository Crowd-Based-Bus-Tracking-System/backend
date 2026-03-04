import { getIO } from "../index.js";
import redis from "../../config/redis.js"
import pool from "../../config/db.js";
import { getStopById, getRouteStops } from "../../models/stops.js";
import { getSegmentTime } from "../../utils/eta-helpers.js";

function parseTimeToMs(timeStr) {
    if (!timeStr) return 0;
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h * 3600 + m * 60 + (s || 0)) * 1000;
}

export const getSimulatedBusStatus = async (busId, routeId) => {
    const tripsResult = await pool.query(`
        SELECT t.id as trip_id, t.start_time, t.end_time,
               ts.stop_id, ts.scheduled_arrival_time as sheduled_arrival_time,
               st.sequence, st.name as stop_name, st.latitude, st.longitude
        FROM trips t
        JOIN trip_schedules ts ON ts.trip_id = t.id
        JOIN stops st ON ts.stop_id = st.id
        WHERE t.route_id = $1 AND t.bus_id = $2
        ORDER BY t.start_time ASC, st.sequence ASC
    `, [routeId, busId]);

    if (tripsResult.rows.length === 0) {
        return { busId, status: "UNKNOWN", message: "No schedule data available for this bus" };
    }

    const now = new Date();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const parseTime = (timeStr) => {
        const [h, m, s] = timeStr.split(':').map(Number);
        return h * 3600 + m * 60 + (s || 0);
    };

    const trips = [];
    let currentTripId = null;
    let currentTrip = null;

    for (const row of tripsResult.rows) {
        if (row.trip_id !== currentTripId) {
            currentTripId = row.trip_id;
            currentTrip = {
                id: row.trip_id,
                startSecs: parseTime(row.start_time),
                endSecs: parseTime(row.end_time),
                stops: []
            };
            trips.push(currentTrip);
        }
        currentTrip.stops.push({
            ...row,
            tMs: parseTime(row.sheduled_arrival_time) * 1000
        });
    }

    let activeTrip = null;
    let nextTrip = null;

    for (const trip of trips) {
        if (currentSeconds >= trip.startSecs && currentSeconds <= trip.endSecs) {
            activeTrip = trip;
            break;
        }
        if (trip.startSecs > currentSeconds && !nextTrip) {
            nextTrip = trip;
        }
    }

    const selectedTrip = activeTrip || nextTrip || trips[0]; // Active, Next, or wrap to Tomorrow's First
    const nowMs = currentSeconds * 1000;

    let segmentProgress = 0;
    let lastStop = selectedTrip.stops[0];
    let nextStop = selectedTrip.stops[0];

    if (activeTrip) {
        lastStop = null;
        nextStop = null;

        for (let stop of selectedTrip.stops) {
            if (stop.tMs <= nowMs) {
                lastStop = stop;
            } else if (stop.tMs > nowMs && !nextStop) {
                nextStop = stop;
                break;
            }
        }

        if (!lastStop && nextStop) lastStop = nextStop;
        if (lastStop && !nextStop) nextStop = lastStop;

        if (lastStop && nextStop && lastStop.tMs !== nextStop.tMs) {
            segmentProgress = (nowMs - lastStop.tMs) / (nextStop.tMs - lastStop.tMs);
            segmentProgress = Math.max(0, Math.min(1, segmentProgress));
        }
    }

    if (!lastStop || !nextStop) return { busId, status: "UNKNOWN" };

    const lat = parseFloat(lastStop.latitude) + (parseFloat(nextStop.latitude) - parseFloat(lastStop.latitude)) * segmentProgress;
    const lng = parseFloat(lastStop.longitude) + (parseFloat(nextStop.longitude) - parseFloat(lastStop.longitude)) * segmentProgress;

    return {
        busId,
        routeId,
        status: activeTrip ? (segmentProgress < 0.1 ? "At_STOP" : "IN_TRANSIT") : "AT_TERMINUS",
        isSimulated: true,
        lastConfirmedStop: {
            stopId: parseInt(lastStop.stop_id),
            stopName: lastStop.stop_name || "Unknown",
            arrivedAt: todayMidnight.getTime() + lastStop.tMs,
            timeSinceArrival: activeTrip ? Math.round((nowMs - lastStop.tMs) / 1000) : 0
        },
        estimatedPosition: {
            fromStopId: parseInt(lastStop.stop_id),
            toStopId: parseInt(nextStop.stop_id),
            segmentProgress: Math.round(segmentProgress * 100) / 100,
            lat,
            lng
        },
        lastUpdate: Date.now()
    };
};

export const getBusStatus = async (busId, routeId) => {
    const lastStopId = await redis.get(`bus:${busId}:last_stop`);
    const lastArrivalTime = await redis.get(`bus:${busId}:last_arrival_time`);

    if (!lastStopId || !lastArrivalTime) {
        return await getSimulatedBusStatus(busId, routeId);
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
