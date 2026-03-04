import pool from "../config/db.js";
import { getRouteStops } from "../models/route.js";
import { getBusesByRoute } from "../models/bus.js";
import redis from "../config/redis.js";

export const getRoutes = async (req, res) => {
    try {
        const routesQuery = await pool.query("SELECT * FROM routes");

        const routesData = await Promise.all(routesQuery.rows.map(async (route) => {
            const stopsResult = await pool.query(
                "SELECT id as db_id, route_id, name, latitude as lat, longitude as lng, sequence FROM stops WHERE route_id = $1 ORDER BY sequence",
                [route.id]
            );

            const buses = await getBusesByRoute(route.id);

            const enrichedBuses = await Promise.all(buses.map(async (b) => {
                const lastStop = await redis.get(`bus:${b.id}:last_stop`);
                const lastArrivalTime = await redis.get(`bus:${b.id}:last_arrival_time`);

                let formattedUpdate = "Just now";
                if (lastArrivalTime) {
                    const timeMs = parseInt(lastArrivalTime) * 1000;
                    formattedUpdate = new Date(timeMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }

                return {
                    id: `b${b.id}`,
                    dbId: b.id,
                    plateNumber: b.bus_number,
                    status: b.status.toLowerCase(),
                    lastUpdated: formattedUpdate,
                    occupancy: "low",
                    lat: 0,
                    lng: 0,
                    speed: 0,
                    heading: 0,
                    hasConfirmedStop: lastStop !== null
                };
            }));

            return {
                id: `route-${route.id}`,
                dbId: route.id,
                routeNumber: route.route_number,
                name: route.name,
                from: route.start_city,
                to: route.end_city,
                color: "#10b981",
                stops: stopsResult.rows.map(s => ({
                    id: `s${s.db_id}`,
                    dbId: s.db_id,
                    name: s.name,
                    lat: s.lat,
                    lng: s.lng
                })),
                buses: enrichedBuses
            };
        }));

        res.status(200).json(routesData);
    } catch (error) {
        console.error("Error fetching routes:", error);
        res.status(500).json({ error: "Failed to fetch routes data" });
    }
};

export const getRouteTimetable = async (req, res) => {
    try {
        const routeDbId = req.params.routeId.replace('route-', '');

        const shedResult = await pool.query(
            `SELECT s.id, s.route_id, s.stop_id, s.sheduled_arrival_time, s.day_type, 
             st.sequence, st.name as stop_name
             FROM shedules s
             JOIN stops st ON s.stop_id = st.id
             WHERE s.route_id = $1
             ORDER BY s.day_type, st.sequence, s.sheduled_arrival_time`,
            [routeDbId]
        );

        const timetable = {
            routeId: req.params.routeId,
            weekday: [],
            weekend: []
        };

        const formatTime = (t) => t ? t.substring(0, 5) : '';

        const schedulesArray = shedResult.rows;
        const dayGroups = {
            'WEEKDAY': [],
            'WEEKEND': []
        };

        const uniqueDayTypes = [...new Set(schedulesArray.map(s => s.day_type))];

        for (const day of uniqueDayTypes) {
            const daySchedules = schedulesArray.filter(s => s.day_type === day);

            const stopSchedules = daySchedules.map(s => ({
                stopId: `s${s.stop_id}`,
                stopName: s.stop_name,
                arrivalTime: formatTime(s.sheduled_arrival_time)
            }));

            const entry = {
                tripId: `trip-${day.toLowerCase()}-all`,
                busId: `b-generic`,
                departureTime: formatTime(daySchedules[0]?.sheduled_arrival_time) || "06:00",
                arrivalTime: formatTime(daySchedules[daySchedules.length - 1]?.sheduled_arrival_time) || "20:00",
                busType: "normal",
                stopSchedules
            };

            if (day === 'WEEKEND') {
                timetable.weekend.push(entry);
            } else {
                timetable.weekday.push(entry);
            }
        }

        res.status(200).json(timetable);

    } catch (error) {
        console.error("Error fetching timetable:", error);
        res.status(500).json({ error: "Failed to fetch timetable data" });
    }
};
