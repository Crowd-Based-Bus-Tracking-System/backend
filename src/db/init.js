import fs from "fs";
import path from "path";
import pool from "../config/db.js";


export async function initDb() {
    const migrationsDir = path.join(process.cwd(), "src/db/migrations");
    const migrationFiles = fs.readdirSync(migrationsDir).sort();

    console.log("Running migrations...");

    for (const file of migrationFiles) {
        const sql = fs.readFileSync(
            path.join(migrationsDir, file), 
            "utf-8"
        );
        await pool.query(sql);
        console.log(`Completed Migration ${file}`);
    }
    console.log("Migrations completed");
}