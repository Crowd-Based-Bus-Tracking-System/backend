import pool from "../config/db.js";


export const storeArrival = async (arrivalData) => {
    const {
        busId,
        stopId,
        scheduledTime,
        delaySeconds,
        weather,
        trafficLevel,
        eventNearby,
        arrivedAt
    } = arrivalData;

    const query = `
        INSERT INTO arrivals (
            bus_id, stop_id, scheduled_time, delay_seconds, 
            weather, traffic_level, event_nearby, arrived_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;

    const values = [
        busId,
        stopId,
        scheduledTime || null,
        delaySeconds || null,
        weather || null,
        trafficLevel || null,
        eventNearby || false,
        arrivedAt ? new Date(arrivedAt) : new Date()
    ];

    try {
        const result = await pool.query(query, values);
        console.log(`Arrival stored to database: bus ${busId} at stop ${stopId}`);
        return result.rows[0];
    } catch (error) {
        console.error("Error storing arrival to database:", error.message);
        throw error;
    }
};


export const updateSegmentTime = async (segmentData) => {
    const {
        routeId,
        fromStopId,
        toStopId,
        travelSeconds
    } = segmentData;

    const selectQuery = `
        SELECT avg_travel_seconds, stddev_travel_seconds, sample_count
        FROM segment_times
        WHERE route_id = $1 AND from_stop_id = $2 AND to_stop_id = $3;
    `;

    const selectResult = await pool.query(selectQuery, [routeId, fromStopId, toStopId]);

    if (selectResult.rows.length > 0) {
        const existing = selectResult.rows[0];
        const oldCount = existing.sample_count || 0;
        const oldAvg = existing.avg_travel_seconds || travelSeconds;
        const oldStddev = existing.stddev_travel_seconds || 0;

        const newCount = oldCount + 1;
        const newAvg = ((oldAvg * oldCount) + travelSeconds) / newCount;

        const delta = travelSeconds - oldAvg;
        const newVariance = ((oldStddev * oldStddev * oldCount) + (delta * delta)) / newCount;
        const newStddev = Math.sqrt(newVariance);

        const updateQuery = `
            UPDATE segment_times
            SET avg_travel_seconds = $1,
                stddev_travel_seconds = $2,
                sample_count = $3,
                last_updated = NOW()
            WHERE route_id = $4 AND from_stop_id = $5 AND to_stop_id = $6;
        `;

        await pool.query(updateQuery, [
            Math.round(newAvg),
            Math.round(newStddev),
            newCount,
            routeId,
            fromStopId,
            toStopId
        ]);

        console.log(`Segment time updated: route ${routeId}, ${fromStopId}->${toStopId}, samples: ${newCount}`);
    } else {
        const insertQuery = `
            INSERT INTO segment_times (
                route_id, from_stop_id, to_stop_id, 
                avg_travel_seconds, stddev_travel_seconds, sample_count
            )
            VALUES ($1, $2, $3, $4, 0, 1)
            RETURNING *;
        `;

        await pool.query(insertQuery, [routeId, fromStopId, toStopId, travelSeconds]);
        console.log(`New segment time created: route ${routeId}, ${fromStopId}->${toStopId}`);
    }
};


export const getLastArrival = async (busId) => {
    const query = `
        SELECT * FROM arrivals
        WHERE bus_id = $1
        ORDER BY arrived_at DESC
        LIMIT 1;
    `;

    try {
        const result = await pool.query(query, [busId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error("Error fetching last arrival:", error.message);
        return null;
    }
};



export const calculateSegmentTimeFromArrivals = async (fromStopId, toStopId, routeId = null) => {
    const query = routeId ? `
        SELECT 
            AVG(EXTRACT(EPOCH FROM (a2.arrived_at - a1.arrived_at))) as avg_seconds
        FROM arrivals a1
        JOIN arrivals a2 ON a1.bus_id = a2.bus_id
        JOIN buses b ON a1.bus_id = b.id
        WHERE a1.stop_id = $1 
            AND a2.stop_id = $2
            AND b.route_id = $3
            AND a2.arrived_at > a1.arrived_at
            AND EXTRACT(EPOCH FROM (a2.arrived_at - a1.arrived_at)) BETWEEN 0 AND 7200
    ` : `
        SELECT 
            AVG(EXTRACT(EPOCH FROM (a2.arrived_at - a1.arrived_at))) as avg_seconds
        FROM arrivals a1
        JOIN arrivals a2 ON a1.bus_id = a2.bus_id
        WHERE a1.stop_id = $1 
            AND a2.stop_id = $2
            AND a2.arrived_at > a1.arrived_at
            AND EXTRACT(EPOCH FROM (a2.arrived_at - a1.arrived_at)) BETWEEN 0 AND 7200
    `;

    const params = routeId ? [fromStopId, toStopId, routeId] : [fromStopId, toStopId];
    const result = await pool.query(query, params);

    return result.rows[0]?.avg_seconds ? Math.round(result.rows[0].avg_seconds) : null;
};


export const getAverageDelayToday = async (busId) => {
    try {
        const result = await pool.query(`
            SELECT AVG(delay_seconds) as avg_delay
            FROM arrivals
            WHERE bus_id = $1
              AND arrived_at::date = CURRENT_DATE
        `, [busId]);

        return result.rows[0]?.avg_delay || 0;
    } catch (error) {
        console.error("Error getting average delay today:", error);
        return 0;
    }
}


export const getAverageDelayByHour = async (stopId, hour) => {
    try {
        const result = await pool.query(`
            SELECT AVG(delay_seconds) as avg_delay
            FROM arrivals
            WHERE stop_id = $1
              AND EXTRACT(HOUR FROM arrived_at) = $2
              AND arrived_at > NOW() - INTERVAL '30 days'
        `, [stopId, hour]);

        return result.rows[0]?.avg_delay || 0;
    } catch (error) {
        console.error("Error getting average delay by hour:", error);
        return 0;
    }
}

export const getDelayTrend = async (busId) => {
    const result = await pool.query(`
            SELECT delay_seconds, stop_id
            FROM arrivals
            WHERE bus_id = $1
            ORDER BY arrived_at DESC
            LIMIT 3
        `, [busId]);
    return result;
}

export const getDelaySByHourandDOW = async (stopId, hour, dayOfWeek) => {
    try {
        const result = await pool.query(`
            SELECT delay_seconds
            FROM arrivals
            WHERE stop_id = $1
              AND EXTRACT(HOUR FROM arrived_at) = $2
              AND EXTRACT(DOW FROM arrived_at) = $3
              AND arrived_at > NOW() - INTERVAL '30 days'
            ORDER BY arrived_at DESC
            LIMIT 100
        `, [stopId, hour, dayOfWeek]);

        return result;
    } catch (error) {
        console.error("Error getting average delay by hour and day of week:", error);
        return 0;
    }
}

export const getRecent24hArrivals = async (busId) => {
    const result = await pool.query(`
        SELECT 
            COUNT(*) FILTER (WHERE ABS(delay_seconds) < 300) as on_time_count,
            COUNT(*) as total_count
        FROM arrivals
        WHERE bus_id = $1
            AND arrived_at > NOW() - INTERVAL '24 hours'
    `, [busId]);

    return result;
}

export const getRecent7dArrivals = async (busId) => {
    const result = await pool.query(`
        SELECT 
            COUNT(*) FILTER (WHERE ABS(delay_seconds) < 300) as on_time_count,
            COUNT(*) as total_count
        FROM arrivals
        WHERE bus_id = $1
          AND arrived_at > NOW() - INTERVAL '7 days'
    `, [busId]);

    return result;
}

export const getStopDelays = async (stopId) => {
    const result = await pool.query(`
        SELECT AVG(delay_seconds) as avg_delay
            FROM arrivals
            WHERE stop_id = $1
              AND arrived_at > NOW() - INTERVAL '30 days'
        `, [stopId]);

    return result;
}
