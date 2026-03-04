import pool from "../config/db.js";
import { getRouteStops } from "../models/route.js";
import { getBusesByRoute } from "../models/bus.js";
import redis from "../config/redis.js";
import { getBusStatus } from "../socket/emitters/bus-updates.js";

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
                const status = await getBusStatus(b.id, route.id);

                let formattedUpdate = "Just now";
                if (status.lastConfirmedStop?.arrivedAt) {
                    formattedUpdate = new Date(status.lastConfirmedStop.arrivedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }

                return {
                    id: `b${b.id}`,
                    dbId: b.id,
                    plateNumber: b.bus_number,
                    status: status.status,
                    isSimulated: status.isSimulated || false,
                    lastUpdated: formattedUpdate,
                    occupancy: "low",
                    lat: status.estimatedPosition?.lat || 0,
                    lng: status.estimatedPosition?.lng || 0,
                    speed: 0,
                    heading: 0,
                    hasConfirmedStop: !status.isSimulated
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
            `SELECT ts.id, t.route_id, t.bus_id, ts.stop_id, ts.scheduled_arrival_time, 
             ts.stop_sequence as sequence, st.name as stop_name, t.id as trip_id
             FROM trip_schedules ts
             JOIN trips t ON ts.trip_id = t.id
             JOIN stops st ON ts.stop_id = st.id
             WHERE t.route_id = $1
             ORDER BY t.id, ts.stop_sequence, ts.scheduled_arrival_time`,
            [routeDbId]
        );

        const timetable = {
            routeId: req.params.routeId,
            weekday: [],
            weekend: []
        };

        const formatTime = (t) => t ? t.substring(0, 5) : '';

        const schedulesArray = shedResult.rows;

        const uniqueTrips = [...new Set(schedulesArray.map(s => s.trip_id))];

        for (const tId of uniqueTrips) {
            const tripStops = schedulesArray.filter(s => s.trip_id === tId);

            const stopSchedules = tripStops.map(s => ({
                stopId: `s${s.stop_id}`,
                stopName: s.stop_name,
                arrivalTime: formatTime(s.scheduled_arrival_time)
            }));

            const entry = {
                tripId: `trip-${tId}`,
                busId: tripStops[0].bus_id,
                departureTime: formatTime(tripStops[0]?.scheduled_arrival_time) || "06:00",
                arrivalTime: formatTime(tripStops[tripStops.length - 1]?.scheduled_arrival_time) || "20:00",
                busType: "normal",
                stopSchedules
            };

            timetable.weekday.push(entry);
            timetable.weekend.push(entry);
        }

        res.status(200).json(timetable);

    } catch (error) {
        console.error("Error fetching timetable:", error);
        res.status(500).json({ error: "Failed to fetch timetable data" });
    }
};
