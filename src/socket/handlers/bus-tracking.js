
import { getRouteBusesSortedByETA } from "../../services/routeBuses.service.js";

export const setupBusTrackingHandlers = (socket, io) => {
    socket.on("subscribe:bus", async ({ busId, routeId }) => {
        const room = `bus:${busId}`;
        socket.join(room);
        console.log(`Client ${socket.id} joined room ${room}`);

        const status = await getBusStatus(busId, routeId);
        socket.emit("bus:status", status);
    });

    socket.on("unsubscribe:bus", ({ busId }) => {
        const room = `bus:${busId}`;
        socket.leave(room);
        console.log(`Client ${socket.id} unsubscribed from room ${room}`);
    })

    socket.on("subscribe:route", async ({ routeId, targetStopId, location }) => {
        const room = `route:${routeId}`;
        socket.join(room);
        console.log(`Client ${socket.id} joined room ${room}`);

        try {
            const result = await getRouteBusesSortedByETA(routeId, targetStopId, location);
            socket.emit("route:buses", result);
        } catch (error) {
            console.error(`Error fetching route buses for route ${routeId}:`, error.message);
            socket.emit("route:buses", {
                routeId,
                buses: [],
                error: "Failed to fetch bus ETAs"
            });
        }
    })

    socket.on("unsubscribe:route", ({ routeId }) => {
        const room = `route:${routeId}`;
        socket.leave(room);
        console.log(`Client ${socket.id} unsubscribed from route ${room}`);
    })
}