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
