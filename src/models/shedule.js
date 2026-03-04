import pool from "../config/db.js";

export const getScheduleForStop = async (busId, stopId) => {
    const tripResult = await pool.query(`
        SELECT ts.scheduled_arrival_time as sheduled_arrival_time, t.trip_name
        FROM buses b
        JOIN trips t ON b.current_trip_id = t.id
        JOIN trip_schedules ts ON ts.trip_id = t.id AND ts.stop_id = $2
        WHERE b.id = $1 AND b.current_trip_id IS NOT NULL
    `, [busId, stopId]);

    if (tripResult.rows.length > 0) {
        return tripResult.rows[0];
    }

    const result = await pool.query(`
        SELECT s.sheduled_arrival_time, s.day_type
        FROM buses b
        JOIN shedules s ON b.route_id = s.route_id
        WHERE b.id = $1 AND s.stop_id = $2
    `, [busId, stopId]);

    return result.rows[0] || null;
}