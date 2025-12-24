import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: {
        rejectUnauthorized: false,
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on("connect", () => console.log("Database connected"));
pool.on("error", (err) => console.error("Database error:", err));

export default pool;