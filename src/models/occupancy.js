import pool from "../config/db.js";

export const storeOccupancy = async ({
    busId, stopId, occupancyLevel, reporterCount,
    avgReporterAccuracy, scheduledTime, weather,
    trafficLevel, hourOfDay, dayOfWeek, isRushHour
}) => {
    const result = await pool.query(`
        INSERT INTO occupancy_reports 
            (bus_id, stop_id, occupancy_level, reporter_count, avg_reporter_accuracy,
             scheduled_time, weather, traffic_level, hour_of_day, day_of_week, is_rush_hour)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
    `, [busId, stopId, occupancyLevel, reporterCount, avgReporterAccuracy,
        scheduledTime, weather, trafficLevel, hourOfDay, dayOfWeek, isRushHour]);
    return result.rows[0];
};

export const getHistoricalOccupancy = async (busId, limit = 20) => {
    const result = await pool.query(`
        SELECT * FROM occupancy_reports
        WHERE bus_id = $1
        ORDER BY confirmed_at DESC
        LIMIT $2
    `, [busId, limit]);
    return result.rows;
};

export const getAverageOccupancyByHourAndStop = async (stopId, hour, dayOfWeek) => {
    const result = await pool.query(`
        SELECT AVG(occupancy_level) as avg_occupancy,
               COUNT(*) as sample_count
        FROM occupancy_reports
        WHERE stop_id = $1
          AND hour_of_day = $2
          AND day_of_week = $3
          AND confirmed_at > NOW() - INTERVAL '30 days'
    `, [stopId, hour, dayOfWeek]);
    return result.rows[0];
};

export const getAverageOccupancyByRoute = async (busId, hour) => {
    const result = await pool.query(`
        SELECT AVG(occupancy_level) as avg_occupancy,
               COUNT(*) as sample_count
        FROM occupancy_reports
        WHERE bus_id = $1
          AND hour_of_day = $2
          AND confirmed_at > NOW() - INTERVAL '30 days'
    `, [busId, hour]);
    return result.rows[0];
};

export const getRecentOccupancyForBus = async (busId, minutesAgo = 60) => {
    const result = await pool.query(`
        SELECT occupancy_level, stop_id, confirmed_at
        FROM occupancy_reports
        WHERE bus_id = $1
          AND confirmed_at > NOW() - INTERVAL '${minutesAgo} minutes'
        ORDER BY confirmed_at DESC
        LIMIT 5
    `, [busId]);
    return result.rows;
};
