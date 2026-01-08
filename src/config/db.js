import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const pool = new Pool({
    host: process.env.SUPABASE_HOST,
    port: parseInt(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on("connect", () => console.log("Database connected"));
pool.on("error", (err) => console.error("Database error:", err));

export default pool;