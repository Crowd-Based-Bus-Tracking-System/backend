import { Server } from "socket.io";
import { setupBusTrackingHandlers } from "./handlers/bus-tracking";

let io = null;

export const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        }
    })

    io.on("connection", (socket) =>{
        console.log(`Client connected: ${socket.id}`);

        setupBusTrackingHandlers(socket, io);

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);
        })
    })

    console.log("Scocket.io initialized");
    return io;
}

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
}

export default { initializeSocket, getIO };