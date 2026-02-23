import pool from "../config/db.js";


export const getBusById = async (busId) => {
    const query = `SELECT * FROM buses WHERE id = $1;`;

    try {
        const result = await pool.query(query, [busId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error("Error fetching bus:", error.message);
        return null;
    }
};

export const getBusesByRoute = async (routeId) => {
    const query = `SELECT id, bus_number, route_id, status FROM buses WHERE route_id = $1 AND status = 'ACTIVE';`;

    try {
        const result = await pool.query(query, [routeId]);
        return result.rows;
    } catch (error) {
        console.error("Error fetching buses by route:", error.message);
        return [];
    }
};
