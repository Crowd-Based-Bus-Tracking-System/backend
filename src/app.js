import dotenv from "dotenv";
dotenv.config();

import arrivalRouter from "./routes/arrival.route.js";
import mlIntegrationRouter from "./routes/mlIntegration.route.js";
import etaRouter from "./routes/eta.route.js";

const express = (await import("express")).default;
const cors = (await import("cors")).default;
const { initDb } = await import("./db/init.js");

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/arrival", arrivalRouter);
app.use("/api/mlIntegration", mlIntegrationRouter);
app.use("/api/eta", etaRouter);

async function startServer() {
    try {
        await initDb();
    } catch (error) {
        console.error("Failed to initialize database:", error);
    }
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer();
