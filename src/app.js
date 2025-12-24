import dotenv from "dotenv";
dotenv.config();

const express = (await import("express")).default;
const cors = (await import("cors")).default;
const { initDb } = await import("./db/init.js");

const app = express();

app.use(cors());
app.use(express.json());

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
