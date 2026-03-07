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

export const getSegmentDistance = async (fromStopId, toStopId, routeId = null) => {
    try {
        let query;
        let params;

        if (routeId) {
            query = `
                SELECT distance_in_meters
                FROM segment_times
                WHERE from_stop_id = $1 AND to_stop_id = $2 AND route_id = $3
                LIMIT 1
            `;
            params = [fromStopId, toStopId, routeId];
        } else {
            query = `
                SELECT distance_in_meters
                FROM segments
                WHERE from_stop_id = $1 AND to_stop_id = $2
                LIMIT 1
            `;
            params = [fromStopId, toStopId];
        }

        const result = await pool.query(query, params);
        
        if (result.rows.length > 0) {
            return result.rows[0].distance_in_meters;
        }
        
        return null;
    } catch (error) {
        console.error("Error fetching segment distance:", error);
        return null;
    }
};
