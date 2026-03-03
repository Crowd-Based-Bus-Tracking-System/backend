import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedJson = JSON.parse(fs.readFileSync(path.join(__dirname, "seedDataGenerated.json"), "utf8"));
let seedJs = fs.readFileSync(path.join(__dirname, "seed.js"), "utf8");

// Replace ROUTES_DATA
seedJs = seedJs.replace(
    /const ROUTES_DATA = \[[\s\S]*?\];/,
    `const ROUTES_DATA = [\n${seedJson.ROUTES_DATA}\n];`
);

// Replace STOPS_DATA
seedJs = seedJs.replace(
    /const STOPS_DATA = \[[\s\S]*?\];/,
    `const STOPS_DATA = [\n${seedJson.STOPS_DATA}\n];`
);

// Replace BUSES_DATA
seedJs = seedJs.replace(
    /const BUSES_DATA = \[[\s\S]*?\];/,
    `const BUSES_DATA = [\n${seedJson.BUSES_DATA}\n];`
);

// Replace TRIPS_DATA
seedJs = seedJs.replace(
    /const TRIPS_DATA = \[[\s\S]*?\];/,
    `const TRIPS_DATA = [\n${seedJson.TRIPS_DATA}\n];`
);

// Overwrite seedTrips to insert bus_id constraint
seedJs = seedJs.replace(
    /INSERT INTO trips \(id, route_id, trip_name, start_time, end_time\) VALUES \(\$1, \$2, \$3, \$4, \$5\);/g,
    `INSERT INTO trips (id, route_id, trip_name, start_time, end_time, bus_id) VALUES ($1, $2, $3, $4, $5, $6);`
);

seedJs = seedJs.replace(
    /\[trip\.id, trip\.route_id, trip\.trip_name, trip\.start_time, trip\.end_time\]/g,
    `[trip.id, trip.route_id, trip.trip_name, trip.start_time, trip.end_time, trip.bus_id]`
);

// We need to overwrite seedTripSchedules completely because original has programmatic hour calculation
const newSeedTripSchedulesFn = `async function seedTripSchedules() {
    console.log("📆 Seeding trip schedules...");

    let scheduleCount = 0;
    const TRIP_SCHEDULES = [
${seedJson.TRIP_SCHEDULES}
    ];

    for (const ts of TRIP_SCHEDULES) {
        await pool.query(
            "INSERT INTO trip_schedules (trip_id, stop_id, scheduled_arrival_time, stop_sequence) VALUES ($1, $2, $3, $4);",
            [ts.trip_id, ts.stop_id, ts.scheduled_arrival_time, ts.stop_sequence]
        );
        scheduleCount++;
    }

    console.log(\`  ✓ Inserted \${scheduleCount} trip schedules\\n\`);
}`;
seedJs = seedJs.replace(/async function seedTripSchedules\(\) \{[\s\S]*?console\.log\(\`  ✓ Inserted \${scheduleCount} trip schedules\\n\`\);\n\}/, newSeedTripSchedulesFn);

fs.writeFileSync(path.join(__dirname, "seed.js"), seedJs);
console.log("seed.js updated successfully.");
