import pool from "../config/db.js";

export const getSegmentTimes = async (fromStopId, toStopId, routeId = null) => {
    if (routeId) {
        const result = await pool.query(`
            SELECT AVG(avg_travel_seconds)::int as avg_travel_seconds
            FROM segment_times
            WHERE from_stop_id = $1 AND to_stop_id = $2 AND route_id = $3
            GROUP BY from_stop_id, to_stop_id
        `, [fromStopId, toStopId, routeId]);

        return result.rows;
    } else {
        const result = await pool.query(`
            SELECT AVG(avg_travel_seconds)::int as avg_travel_seconds
            FROM segment_times
            WHERE from_stop_id = $1 AND to_stop_id = $2
            GROUP BY from_stop_id, to_stop_id
        `, [fromStopId, toStopId]);

        return result.rows;
    }
};
