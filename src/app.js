import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { initDb } from "./db/init.js";

const app = express();

app.use(cors());
app.use(express.json());

dotenv.config();

const PORT = process.env.PORT || 3000;

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
