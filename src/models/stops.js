import pool from "../config/db.js"


export const getStopById = async (stopId) => {
    const result = await pool.query(`
        SELECT id, name, latitude, longitude, sequence
        FROM stops
        WHERE id = $1
    `, [stopId]);

    return result.rows[0] || null;
};

export const getRouteStops = async (routeId) => {
    const result = await pool.query(`
        SELECT id, name, latitude, longitude, sequence
        FROM stops
        WHERE route_id = $1
        ORDER BY sequence    
    `, [routeId]);

    return result.rows;
}