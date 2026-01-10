import pool from "../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample data structure
const ROUTES_DATA = [
    { id: 1, name: "Downtown Express", start_city: "Central Station", end_city: "North Terminal" },
    { id: 2, name: "University Line", start_city: "Main Campus", end_city: "Tech Park" },
    { id: 3, name: "Airport Shuttle", start_city: "City Center", end_city: "International Airport" }
];

const STOPS_DATA = [
    // Route 1 stops (ids 1-7)
    { id: 1, route_id: 1, name: "Central Station", latitude: 6.9271, longitude: 79.8612, sequence: 1 },
    { id: 2, route_id: 1, name: "City Hall", latitude: 6.9319, longitude: 79.8478, sequence: 2 },
    { id: 3, route_id: 1, name: "Market Square", latitude: 6.9368, longitude: 79.8501, sequence: 3 },
    { id: 4, route_id: 1, name: "Park Junction", latitude: 6.9415, longitude: 79.8553, sequence: 4 },
    { id: 5, route_id: 1, name: "Memorial Plaza", latitude: 6.9462, longitude: 79.8605, sequence: 5 },
    { id: 6, route_id: 1, name: "Shopping Center", latitude: 6.9509, longitude: 79.8657, sequence: 6 },
    { id: 7, route_id: 1, name: "North Terminal", latitude: 6.9556, longitude: 79.8709, sequence: 7 },

    // Route 2 stops (ids 8-14)
    { id: 8, route_id: 2, name: "Main Campus", latitude: 6.9015, longitude: 79.8607, sequence: 1 },
    { id: 9, route_id: 2, name: "Library Corner", latitude: 6.9062, longitude: 79.8659, sequence: 2 },
    { id: 10, route_id: 2, name: "Science Block", latitude: 6.9109, longitude: 79.8711, sequence: 3 },
    { id: 11, route_id: 2, name: "Student Center", latitude: 6.9156, longitude: 79.8763, sequence: 4 },
    { id: 12, route_id: 2, name: "Medical Faculty", latitude: 6.9203, longitude: 79.8815, sequence: 5 },
    { id: 13, route_id: 2, name: "Engineering Wing", latitude: 6.9250, longitude: 79.8867, sequence: 6 },
    { id: 14, route_id: 2, name: "Tech Park", latitude: 6.9297, longitude: 79.8919, sequence: 7 },

    // Route 3 stops (ids 15-20)
    { id: 15, route_id: 3, name: "City Center", latitude: 6.9271, longitude: 79.8612, sequence: 1 },
    { id: 16, route_id: 3, name: "Hotel District", latitude: 6.9100, longitude: 79.8850, sequence: 2 },
    { id: 17, route_id: 3, name: "Highway Exit", latitude: 6.8929, longitude: 79.9088, sequence: 3 },
    { id: 18, route_id: 3, name: "Cargo Terminal", latitude: 6.8758, longitude: 79.9326, sequence: 4 },
    { id: 19, route_id: 3, name: "Domestic Terminal", latitude: 6.8587, longitude: 79.9564, sequence: 5 },
    { id: 20, route_id: 3, name: "International Airport", latitude: 6.8416, longitude: 79.9802, sequence: 6 }
];

const BUSES_DATA = [
    { id: 1, bus_number: "BUS-001", route_id: 1, status: "ACTIVE" },
    { id: 2, bus_number: "BUS-002", route_id: 1, status: "ACTIVE" },
    { id: 3, bus_number: "BUS-003", route_id: 1, status: "ACTIVE" },
    { id: 4, bus_number: "BUS-004", route_id: 2, status: "ACTIVE" },
    { id: 5, bus_number: "BUS-005", route_id: 2, status: "ACTIVE" },
    { id: 6, bus_number: "BUS-006", route_id: 2, status: "ACTIVE" },
    { id: 7, bus_number: "BUS-007", route_id: 3, status: "ACTIVE" },
    { id: 8, bus_number: "BUS-008", route_id: 3, status: "ACTIVE" },
    { id: 9, bus_number: "BUS-009", route_id: 3, status: "ACTIVE" },
    { id: 10, bus_number: "BUS-010", route_id: 3, status: "ACTIVE" }
];

// Helper functions
function generateDeviceId() {
    return `DEVICE-${Math.random().toString(36).substring(2, 15)}`;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

async function clearDatabase() {
    console.log("\n🗑️  Clearing existing data...");

    try {
        await pool.query("DELETE FROM arrivals;");
        console.log("  ✓ Cleared arrivals");

        await pool.query("DELETE FROM segment_times;");
        console.log("  ✓ Cleared segment_times");

        await pool.query("DELETE FROM shedules;");
        console.log("  ✓ Cleared shedules");

        await pool.query("DELETE FROM users;");
        console.log("  ✓ Cleared users");

        await pool.query("DELETE FROM buses;");
        console.log("  ✓ Cleared buses");

        await pool.query("DELETE FROM stops;");
        console.log("  ✓ Cleared stops");

        await pool.query("DELETE FROM routes;");
        console.log("  ✓ Cleared routes");

        // Reset sequences
        await pool.query("ALTER SEQUENCE routes_id_seq RESTART WITH 1;");
        await pool.query("ALTER SEQUENCE stops_id_seq RESTART WITH 1;");
        await pool.query("ALTER SEQUENCE buses_id_seq RESTART WITH 1;");
        await pool.query("ALTER SEQUENCE users_id_seq RESTART WITH 1;");
        await pool.query("ALTER SEQUENCE shedules_id_seq RESTART WITH 1;");
        await pool.query("ALTER SEQUENCE segment_times_id_seq RESTART WITH 1;");
        await pool.query("ALTER SEQUENCE arrivals_id_seq RESTART WITH 1;");

        console.log("  ✓ Reset all sequences\n");
    } catch (error) {
        console.error("Error clearing database:", error.message);
        throw error;
    }
}

async function seedRoutes() {
    console.log("🚌 Seeding routes...");

    for (const route of ROUTES_DATA) {
        await pool.query(
            "INSERT INTO routes (id, name, start_city, end_city) VALUES ($1, $2, $3, $4);",
            [route.id, route.name, route.start_city, route.end_city]
        );
    }

    console.log(`  ✓ Inserted ${ROUTES_DATA.length} routes\n`);
}

async function seedStops() {
    console.log("🛑 Seeding stops...");

    for (const stop of STOPS_DATA) {
        await pool.query(
            "INSERT INTO stops (id, route_id, name, latitude, longitude, sequence) VALUES ($1, $2, $3, $4, $5, $6);",
            [stop.id, stop.route_id, stop.name, stop.latitude, stop.longitude, stop.sequence]
        );
    }

    console.log(`  ✓ Inserted ${STOPS_DATA.length} stops\n`);
}

async function seedBuses() {
    console.log("🚐 Seeding buses...");

    for (const bus of BUSES_DATA) {
        await pool.query(
            "INSERT INTO buses (id, bus_number, route_id, status) VALUES ($1, $2, $3, $4);",
            [bus.id, bus.bus_number, bus.route_id, bus.status]
        );
    }

    console.log(`  ✓ Inserted ${BUSES_DATA.length} buses\n`);
}

async function seedUsers() {
    console.log("👥 Seeding users...");

    const userCount = 20;
    for (let i = 0; i < userCount; i++) {
        await pool.query(
            "INSERT INTO users (device_id) VALUES ($1);",
            [generateDeviceId()]
        );
    }

    console.log(`  ✓ Inserted ${userCount} users\n`);
}

async function seedSchedules() {
    console.log("📅 Seeding schedules...");

    let scheduleCount = 0;

    // Generate schedules for each stop on each route
    for (const route of ROUTES_DATA) {
        const routeStops = STOPS_DATA.filter(s => s.route_id === route.id);

        // Morning schedule (6:00 AM start)
        let currentTime = 6 * 60; // minutes from midnight
        for (const stop of routeStops) {
            const hours = Math.floor(currentTime / 60);
            const minutes = currentTime % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

            await pool.query(
                "INSERT INTO shedules (route_id, stop_id, sheduled_arrival_time, day_type) VALUES ($1, $2, $3, $4);",
                [route.id, stop.id, timeStr, 'weekday']
            );
            scheduleCount++;

            currentTime += 15; // 15 minutes between stops
        }

        // Afternoon schedule (14:00 PM start)
        currentTime = 14 * 60;
        for (const stop of routeStops) {
            const hours = Math.floor(currentTime / 60);
            const minutes = currentTime % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

            await pool.query(
                "INSERT INTO shedules (route_id, stop_id, sheduled_arrival_time, day_type) VALUES ($1, $2, $3, $4);",
                [route.id, stop.id, timeStr, 'weekday']
            );
            scheduleCount++;

            currentTime += 15;
        }

        // Evening schedule (20:00 PM start)
        currentTime = 20 * 60;
        for (const stop of routeStops) {
            const hours = Math.floor(currentTime / 60);
            const minutes = currentTime % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

            await pool.query(
                "INSERT INTO shedules (route_id, stop_id, sheduled_arrival_time, day_type) VALUES ($1, $2, $3, $4);",
                [route.id, stop.id, timeStr, 'weekend']
            );
            scheduleCount++;

            currentTime += 15;
        }
    }

    console.log(`  ✓ Inserted ${scheduleCount} schedules\n`);
}

async function seedSegmentTimes() {
    console.log("⏱️  Seeding segment times...");

    let segmentCount = 0;

    // Create segment times for consecutive stops on each route
    for (const route of ROUTES_DATA) {
        const routeStops = STOPS_DATA.filter(s => s.route_id === route.id).sort((a, b) => a.sequence - b.sequence);

        for (let i = 0; i < routeStops.length - 1; i++) {
            const fromStop = routeStops[i];
            const toStop = routeStops[i + 1];

            // Average travel time between stops (10-20 minutes)
            const avgSeconds = 600 + Math.floor(Math.random() * 600);
            const stddevSeconds = Math.floor(avgSeconds * 0.15); // 15% variation
            const sampleCount = 50 + Math.floor(Math.random() * 50);

            await pool.query(
                "INSERT INTO segment_times (route_id, from_stop_id, to_stop_id, avg_travel_seconds, stddev_travel_seconds, sample_count) VALUES ($1, $2, $3, $4, $5, $6);",
                [route.id, fromStop.id, toStop.id, avgSeconds, stddevSeconds, sampleCount]
            );
            segmentCount++;
        }
    }

    console.log(`  ✓ Inserted ${segmentCount} segment times\n`);
}

async function seedArrivals() {
    console.log("📍 Seeding arrivals from CSV...");

    try {
        const csvPath = path.join(__dirname, "../../ml/data/arrivals/arrivals.csv");

        if (!fs.existsSync(csvPath)) {
            console.log("  ⚠️  arrivals.csv not found, skipping CSV import");
            return;
        }

        const csvContent = fs.readFileSync(csvPath, "utf-8");
        const lines = csvContent.split("\n").filter(line => line.trim());

        // Skip header
        const dataLines = lines.slice(1);
        let insertCount = 0;
        let skipCount = 0;

        for (const line of dataLines) {
            if (!line.trim()) continue;

            const values = parseCSVLine(line);
            if (values.length < 34) continue;

            const busId = parseInt(values[0]);
            const stopId = parseInt(values[1]);
            const arrivalTime = parseInt(values[2]);

            // Skip invalid data
            if (!busId || !stopId || !arrivalTime || busId > 10 || stopId > 20) {
                skipCount++;
                continue;
            }

            // Convert timestamp to Date
            let arrivedAt;
            if (arrivalTime > 1000000000000) {
                // Milliseconds
                arrivedAt = new Date(arrivalTime);
            } else {
                // Seconds
                arrivedAt = new Date(arrivalTime * 1000);
            }

            // Extract weather and traffic data from CSV
            const rainMm = parseFloat(values[27]) || 0;
            const snowMm = parseFloat(values[28]) || 0;
            const temperature = parseFloat(values[29]) || 20;
            const windSpeed = parseFloat(values[30]) || 0;
            const humidity = parseFloat(values[31]) || 50;

            // Determine weather condition
            let weather = "Clear";
            if (rainMm > 0) weather = "Rain";
            else if (snowMm > 0) weather = "Snow";
            else if (humidity > 80) weather = "Clouds";

            // Determine traffic level (simplified)
            const hourOfDay = parseInt(values[38]) || 0;
            let trafficLevel = "Low";
            if (hourOfDay >= 7 && hourOfDay <= 9) trafficLevel = "High";
            else if (hourOfDay >= 17 && hourOfDay <= 19) trafficLevel = "High";
            else if (hourOfDay >= 10 && hourOfDay <= 16) trafficLevel = "Medium";

            // Calculate delay (simplified - using some feature from CSV)
            const delaySeconds = Math.floor(Math.random() * 300) - 150; // -150 to +150 seconds

            // Get scheduled time (simplified)
            const scheduledHour = hourOfDay;
            const scheduledMinute = Math.floor(Math.random() * 60);
            const scheduledTime = `${scheduledHour.toString().padStart(2, '0')}:${scheduledMinute.toString().padStart(2, '0')}:00`;

            try {
                await pool.query(
                    `INSERT INTO arrivals (bus_id, stop_id, scheduled_time, delay_seconds, weather, traffic_level, event_nearby, arrived_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
                    [busId, stopId, scheduledTime, delaySeconds, weather, trafficLevel, false, arrivedAt]
                );
                insertCount++;
            } catch (err) {
                skipCount++;
            }
        }

        console.log(`  ✓ Inserted ${insertCount} arrivals from CSV`);
        if (skipCount > 0) {
            console.log(`  ⚠️  Skipped ${skipCount} invalid/duplicate entries\n`);
        } else {
            console.log("");
        }
    } catch (error) {
        console.error("  ✗ Error seeding arrivals:", error.message);
    }
}

async function seed() {
    console.log("\n═══════════════════════════════════════");
    console.log("   DATABASE SEEDING SCRIPT");
    console.log("═══════════════════════════════════════\n");

    try {
        await clearDatabase();
        await seedRoutes();
        await seedStops();
        await seedBuses();
        await seedUsers();
        await seedSchedules();
        await seedSegmentTimes();
        await seedArrivals();

        // Print summary
        console.log("═══════════════════════════════════════");
        console.log("   SEEDING COMPLETED SUCCESSFULLY! ✨");
        console.log("═══════════════════════════════════════\n");

        const counts = await Promise.all([
            pool.query("SELECT COUNT(*) FROM routes"),
            pool.query("SELECT COUNT(*) FROM stops"),
            pool.query("SELECT COUNT(*) FROM buses"),
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM shedules"),
            pool.query("SELECT COUNT(*) FROM segment_times"),
            pool.query("SELECT COUNT(*) FROM arrivals")
        ]);

        console.log("📊 Final row counts:");
        console.log(`   Routes:        ${counts[0].rows[0].count}`);
        console.log(`   Stops:         ${counts[1].rows[0].count}`);
        console.log(`   Buses:         ${counts[2].rows[0].count}`);
        console.log(`   Users:         ${counts[3].rows[0].count}`);
        console.log(`   Schedules:     ${counts[4].rows[0].count}`);
        console.log(`   Segment Times: ${counts[5].rows[0].count}`);
        console.log(`   Arrivals:      ${counts[6].rows[0].count}`);
        console.log("\n");

    } catch (error) {
        console.error("\n❌ Seeding failed:", error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seed();
