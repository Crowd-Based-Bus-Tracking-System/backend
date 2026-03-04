import dotenv from "dotenv";
dotenv.config();

import arrivalRouter from "./routes/arrival.route.js";
import mlIntegrationRouter from "./routes/mlIntegration.route.js";
import etaRouter from "./routes/eta.route.js";
import authRouter from "./routes/auth.route.js";
import routeRouter from "./routes/route.route.js";
import occupancyRouter from "./routes/occupancy.route.js";
import { createServer } from "http";
import { initializeSocket } from "./socket/index.js";
import { startTripAssignerCron } from "./services/tripAssigner.service.js";

const express = (await import("express")).default;
const cors = (await import("cors")).default;

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);

initializeSocket(httpServer);
startTripAssignerCron();

app.use(cors());
app.use(express.json());

app.use("/api/arrival", arrivalRouter);
app.use("/api/mlIntegration", mlIntegrationRouter);
app.use("/api/eta", etaRouter);
app.use("/api/auth", authRouter);
app.use("/api/routes", routeRouter);
app.use("/api/occupancy", occupancyRouter);

async function startServer() {
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer();
