import pool from "../config/db.js";

export const getRouteStops = async (busId) => {
    const result = await pool.query(`
        SELECT s.id, s.name, s.latitude, s.longitude, s.sequence
        FROM buses b
        JOIN routes r ON b.route_id = r.id
        JOIN stops s ON s.route_id = r.id
        WHERE b.id = $1
        ORDER BY s.sequence;
    `, [busId]);

    return result.rows;
};
