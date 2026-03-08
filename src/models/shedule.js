import pool from "../config/db.js";

export const getActiveOrNextTripForBus = async (busId) => {
    const tripsResult = await pool.query(`
        SELECT t.id as trip_id, t.start_time, t.end_time,
               ts.stop_id, ts.scheduled_arrival_time as sheduled_arrival_time, ts.stop_sequence
        FROM trips t
        JOIN trip_schedules ts ON ts.trip_id = t.id
        WHERE t.bus_id = $1
        ORDER BY t.start_time ASC, ts.stop_sequence ASC
    `, [busId]);

    if (tripsResult.rows.length === 0) return null;

    const parseTime = (timeStr) => {
        const [h, m, s] = timeStr.split(':').map(Number);
        return h * 3600 + m * 60 + (s || 0);
    };

    const now = new Date();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

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
            stop_id: row.stop_id,
            sheduled_arrival_time: row.sheduled_arrival_time,
            tMs: parseTime(row.sheduled_arrival_time) * 1000
        });
    }

    for (const trip of trips) {
        const crossesMidnight = trip.endSecs < trip.startSecs;
        if (crossesMidnight) {
            trip.endSecs += 86400;
            for (const stop of trip.stops) {
                const stopSecs = stop.tMs / 1000;
                if (stopSecs < trip.startSecs) {
                    stop.tMs += 86400 * 1000;
                }
            }
        }
    }

    let activeTrip = null;
    let nextTrip = null;

    for (const trip of trips) {
        const crossesMidnight = trip.endSecs > 86400;
        if (crossesMidnight) {
            const adjustedCurrent = currentSeconds < trip.startSecs
                ? currentSeconds + 86400
                : currentSeconds;
            if (adjustedCurrent >= trip.startSecs && adjustedCurrent <= trip.endSecs) {
                activeTrip = trip;
                activeTrip.normalizedCurrentSeconds = adjustedCurrent;
                break;
            }
        } else {
            if (currentSeconds >= trip.startSecs && currentSeconds <= trip.endSecs) {
                activeTrip = trip;
                activeTrip.normalizedCurrentSeconds = currentSeconds;
                break;
            }
        }
        if (trip.startSecs > currentSeconds && !nextTrip) {
            nextTrip = trip;
        }
    }

    return { activeTrip, nextTrip, firstTrip: trips[0] };
};