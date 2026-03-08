import pool from "../config/db.js";

export const assignActiveTrips = async () => {
    try {
        const query = `
            UPDATE buses b
            SET current_trip_id = subquery.new_trip_id
            FROM (
                SELECT b.id as bus_id, (
                    SELECT t.id FROM trips t
                    WHERE t.bus_id = b.id 
                      AND (
                        CASE 
                          WHEN t.start_time <= t.end_time THEN CURRENT_TIME BETWEEN t.start_time AND t.end_time
                          ELSE CURRENT_TIME >= t.start_time OR CURRENT_TIME <= t.end_time
                        END
                      )
                    ORDER BY t.start_time DESC
                    LIMIT 1
                ) as new_trip_id
                FROM buses b
                WHERE b.status = 'ACTIVE'
            ) subquery
            WHERE b.id = subquery.bus_id 
              AND b.current_trip_id IS DISTINCT FROM subquery.new_trip_id;
        `;
        const result = await pool.query(query);
        if (result.rowCount > 0) {
            console.log(`[TripAssigner] Updated current_trip_id for ${result.rowCount} buses.`);
        }
    } catch (error) {
        console.error("[TripAssigner] Error assigning trips:", error.message);
    }
};

export const startTripAssignerCron = () => {
    assignActiveTrips(); // Run initially
    setInterval(assignActiveTrips, 60000); // Run every 60 seconds
};

startTripAssignerCron();
