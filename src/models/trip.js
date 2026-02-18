import pool from "../config/db.js";

export const getTripsForRoute = async (routeId) => {
    const result = await pool.query(`
        SELECT id, trip_name, start_time, end_time
        FROM trips
        WHERE route_id = $1
        ORDER BY start_time
    `, [routeId]);
    return result.rows;
};

export const getCurrentTripForBus = async (busId) => {
    const result = await pool.query(`
        SELECT t.id, t.trip_name, t.start_time, t.end_time, t.route_id
        FROM trips t
        JOIN buses b ON b.current_trip_id = t.id
        WHERE b.id = $1
    `, [busId]);
    return result.rows[0] || null;
};

export const getTripScheduleForStop = async (tripId, stopId) => {
    const result = await pool.query(`
        SELECT ts.scheduled_arrival_time, ts.stop_sequence, t.trip_name
        FROM trip_schedules ts
        JOIN trips t ON t.id = ts.trip_id
        WHERE ts.trip_id = $1 AND ts.stop_id = $2
    `, [tripId, stopId]);
    return result.rows[0] || null;
};

export const getNextScheduledTrip = async (routeId, currentTime = 'NOW()') => {
    const result = await pool.query(`
        SELECT id, trip_name, start_time, end_time
        FROM trips
        WHERE route_id = $1 
          AND start_time >= $2::time
        ORDER BY start_time
        LIMIT 1
    `, [routeId, currentTime]);
    return result.rows[0] || null;
};

export const setCurrentTrip = async (busId, tripId) => {
    await pool.query(`
        UPDATE buses SET current_trip_id = $1 WHERE id = $2
    `, [tripId, busId]);
};

export const getTripStops = async (tripId) => {
    const result = await pool.query(`
        SELECT ts.stop_id, ts.scheduled_arrival_time, ts.stop_sequence, s.stop_name, s.lat, s.lng
        FROM trip_schedules ts
        JOIN stops s ON s.id = ts.stop_id
        WHERE ts.trip_id = $1
        ORDER BY ts.stop_sequence
    `, [tripId]);
    return result.rows;
};
