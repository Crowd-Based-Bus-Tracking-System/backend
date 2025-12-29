import "dotenv/config";
import redis from "../config/redis.js";
import pool from "../config/db.js";


await redis.set("test", "Hello redis");
const val = await redis.get("test");
console.log(val);

async function testDB() {
    const res = await pool.query("SELECT NOW()");
    console.log("DB time:", res.rows[0]);
    process.exit(0);
}

testDB();