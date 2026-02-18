

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

    socket.on("subscribe:route", ({ routeId }) => {
        const room = `route:${routeId}`;
        socket.join(room);
        console.log(`Client ${socket.id} joined room ${room}`);
    })
}