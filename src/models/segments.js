import pool from "../config/db.js";

export const getSegmentTimes = async (fromStopId, toStopId) => {
    const result = await pool.query(`
        SELECT avg_travel_seconds
        FROM segment_times
        WHERE from_stop_id = $1 AND to_stop_id = $2
    `, [fromStopId, toStopId]);

    return result.rows;
};
