import pool from "../config/db.js";
import { getRouteStops } from "../models/route.js";
import { getBusesByRoute } from "../models/bus.js";

export const getRoutes = async (req, res) => {
    try {
        const routesQuery = await pool.query("SELECT * FROM routes");

        const routesData = await Promise.all(routesQuery.rows.map(async (route) => {
            const stopsResult = await pool.query(
                "SELECT id as db_id, route_id, name, latitude as lat, longitude as lng, sequence FROM stops WHERE route_id = $1 ORDER BY sequence",
                [route.id]
            );

            const buses = await getBusesByRoute(route.id);

            return {
                id: `route-${route.id}`,
                dbId: route.id,
                routeNumber: route.route_number,
                name: route.name,
                from: route.start_city,
                to: route.end_city,
                // the frontend generates static colors, we'll assign randomly or uniformly
                color: "#10b981",
                stops: stopsResult.rows.map(s => ({
                    id: `s${s.db_id}`,
                    dbId: s.db_id,
                    name: s.name,
                    lat: s.lat,
                    lng: s.lng
                })),
                buses: buses.map(b => ({
                    id: `b${b.id}`,
                    dbId: b.id,
                    plateNumber: b.bus_number,
                    status: b.status.toLowerCase(),
                    lastUpdated: "Just now", // In real system, query from redis
                    occupancy: "low",
                    lat: 0,
                    lng: 0,
                    speed: 0,
                    heading: 0
                }))
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

        // 1. Fetch all trips for this route
        const tripsResult = await pool.query(
            "SELECT id, trip_name, start_time, end_time, day_type, bus_id, status FROM trips WHERE route_id = $1 ORDER BY start_time",
            [routeDbId]
        );

        const timetable = {
            routeId: req.params.routeId,
            weekday: [],
            weekend: []
        };

        for (const trip of tripsResult.rows) {
            // Get schedules for this trip
            const schedResult = await pool.query(
                "SELECT stop_id, scheduled_arrival, sequence FROM trip_schedules WHERE trip_id = $1 ORDER BY sequence",
                [trip.id]
            );

            // Format time Helper: HH:MM:SS to HH:MM
            const formatTime = (t) => t ? t.substring(0, 5) : '';

            const stopSchedules = schedResult.rows.map(s => ({
                stopId: `s${s.stop_id}`,
                arrivalTime: formatTime(s.scheduled_arrival)
            }));

            const entry = {
                tripId: `trip-${trip.id}`,
                busId: `b${trip.bus_id}`,
                departureTime: formatTime(trip.start_time),
                arrivalTime: formatTime(trip.end_time),
                busType: "normal", // For simplicity everything is normal
                stopSchedules
            };

            if (trip.day_type === 'WEEKEND') {
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
