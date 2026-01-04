export const getScheduleForStop = async (busId, stopId) => {
    const result = await pool.query(`
        SELECT s.sheduled_arrival_time, s.day_type
        FROM buses b
        JOIN shedules s ON b.route_id = s.route_id
        WHERE b.id = $1 AND s.stop_id = $2
    `, [busId, stopId]);

    return result.rows[0] || null;
}