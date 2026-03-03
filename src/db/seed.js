import pool from "../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample data structure
const ROUTES_DATA = [
    { id: 1, route_number: "138", name: "Colombo - Kandy", start_city: "Colombo Fort", end_city: "Kandy" },
    { id: 2, route_number: "2", name: "Colombo - Galle", start_city: "Colombo Fort", end_city: "Galle" },
    { id: 3, route_number: "4", name: "Colombo - Jaffna", start_city: "Colombo Fort", end_city: "Jaffna" },
    { id: 4, route_number: "99", name: "Colombo - Matara", start_city: "Colombo Fort", end_city: "Matara" },
    { id: 5, route_number: "48", name: "Kandy - Nuwara Eliya", start_city: "Kandy", end_city: "Nuwara Eliya" }
];

const STOPS_DATA = [
    { id: 1, route_id: 1, name: "Colombo Fort", latitude: 6.9344, longitude: 79.8428, sequence: 1 },
    { id: 2, route_id: 1, name: "Kadawatha", latitude: 7.0013, longitude: 79.953, sequence: 2 },
    { id: 3, route_id: 1, name: "Kadugannawa", latitude: 7.2547, longitude: 80.5243, sequence: 3 },
    { id: 4, route_id: 1, name: "Peradeniya", latitude: 7.269, longitude: 80.5942, sequence: 4 },
    { id: 5, route_id: 1, name: "Kandy", latitude: 7.2906, longitude: 80.6337, sequence: 5 },
    { id: 6, route_id: 2, name: "Colombo Fort", latitude: 6.9344, longitude: 79.8428, sequence: 1 },
    { id: 7, route_id: 2, name: "Moratuwa", latitude: 6.773, longitude: 79.8816, sequence: 2 },
    { id: 8, route_id: 2, name: "Panadura", latitude: 6.7136, longitude: 79.9044, sequence: 3 },
    { id: 9, route_id: 2, name: "Ambalangoda", latitude: 6.2352, longitude: 80.054, sequence: 4 },
    { id: 10, route_id: 2, name: "Galle", latitude: 6.0535, longitude: 80.221, sequence: 5 },
    { id: 11, route_id: 3, name: "Colombo Fort", latitude: 6.9344, longitude: 79.8428, sequence: 1 },
    { id: 12, route_id: 3, name: "Kurunegala", latitude: 7.4863, longitude: 80.3623, sequence: 2 },
    { id: 13, route_id: 3, name: "Dambulla", latitude: 7.8742, longitude: 80.6511, sequence: 3 },
    { id: 14, route_id: 3, name: "Anuradhapura", latitude: 8.3114, longitude: 80.4037, sequence: 4 },
    { id: 15, route_id: 3, name: "Kilinochchi", latitude: 9.3803, longitude: 80.377, sequence: 5 },
    { id: 16, route_id: 3, name: "Jaffna", latitude: 9.6615, longitude: 80.0255, sequence: 6 },
    { id: 17, route_id: 4, name: "Colombo Fort", latitude: 6.9344, longitude: 79.8428, sequence: 1 },
    { id: 18, route_id: 4, name: "Panadura", latitude: 6.7136, longitude: 79.9044, sequence: 2 },
    { id: 19, route_id: 4, name: "Galle", latitude: 6.0535, longitude: 80.221, sequence: 3 },
    { id: 20, route_id: 4, name: "Weligama", latitude: 5.9745, longitude: 80.4296, sequence: 4 },
    { id: 21, route_id: 4, name: "Matara", latitude: 5.9549, longitude: 80.555, sequence: 5 },
    { id: 22, route_id: 5, name: "Kandy", latitude: 7.2906, longitude: 80.6337, sequence: 1 },
    { id: 23, route_id: 5, name: "Gampola", latitude: 7.1642, longitude: 80.5767, sequence: 2 },
    { id: 24, route_id: 5, name: "Nawalapitiya", latitude: 7.0489, longitude: 80.5345, sequence: 3 },
    { id: 25, route_id: 5, name: "Nuwara Eliya", latitude: 6.9497, longitude: 80.7891, sequence: 4 }
];

const BUSES_DATA = [
    { id: 1, bus_number: "NB-1234", route_id: 1, status: "ACTIVE", current_trip_id: null },
    { id: 2, bus_number: "NC-5678", route_id: 1, status: "ACTIVE", current_trip_id: null },
    { id: 3, bus_number: "WP-9012", route_id: 1, status: "ACTIVE", current_trip_id: null },
    { id: 4, bus_number: "SP-3456", route_id: 2, status: "ACTIVE", current_trip_id: null },
    { id: 5, bus_number: "SP-7890", route_id: 2, status: "ACTIVE", current_trip_id: null },
    { id: 6, bus_number: "NP-1111", route_id: 3, status: "ACTIVE", current_trip_id: null },
    { id: 7, bus_number: "NP-2222", route_id: 3, status: "ACTIVE", current_trip_id: null },
    { id: 8, bus_number: "SG-4444", route_id: 4, status: "ACTIVE", current_trip_id: null },
    { id: 9, bus_number: "CP-5555", route_id: 5, status: "ACTIVE", current_trip_id: null },
    { id: 10, bus_number: "CP-6666", route_id: 5, status: "ACTIVE", current_trip_id: null }
];

// Each route has 3 trips: Morning, Afternoon, Evening
const TRIPS_DATA = [
    { id: 1, route_id: 1, trip_name: "trip-1", start_time: "05:00:00", end_time: "06:20:00", bus_id: 1 },
    { id: 2, route_id: 1, trip_name: "trip-2", start_time: "08:00:00", end_time: "09:20:00", bus_id: 2 },
    { id: 3, route_id: 1, trip_name: "trip-3", start_time: "11:00:00", end_time: "12:20:00", bus_id: 3 },
    { id: 4, route_id: 1, trip_name: "trip-4", start_time: "14:00:00", end_time: "15:20:00", bus_id: 1 },
    { id: 5, route_id: 1, trip_name: "trip-5", start_time: "17:00:00", end_time: "18:20:00", bus_id: 2 },
    { id: 6, route_id: 2, trip_name: "trip-6", start_time: "05:00:00", end_time: "06:20:00", bus_id: 4 },
    { id: 7, route_id: 2, trip_name: "trip-7", start_time: "08:00:00", end_time: "09:20:00", bus_id: 5 },
    { id: 8, route_id: 2, trip_name: "trip-8", start_time: "11:00:00", end_time: "12:20:00", bus_id: 4 },
    { id: 9, route_id: 2, trip_name: "trip-9", start_time: "14:00:00", end_time: "15:20:00", bus_id: 5 },
    { id: 10, route_id: 2, trip_name: "trip-10", start_time: "17:00:00", end_time: "18:20:00", bus_id: 4 },
    { id: 11, route_id: 3, trip_name: "trip-11", start_time: "05:00:00", end_time: "06:40:00", bus_id: 6 },
    { id: 12, route_id: 3, trip_name: "trip-12", start_time: "08:00:00", end_time: "09:40:00", bus_id: 7 },
    { id: 13, route_id: 3, trip_name: "trip-13", start_time: "11:00:00", end_time: "12:40:00", bus_id: 6 },
    { id: 14, route_id: 3, trip_name: "trip-14", start_time: "14:00:00", end_time: "15:40:00", bus_id: 7 },
    { id: 15, route_id: 3, trip_name: "trip-15", start_time: "17:00:00", end_time: "18:40:00", bus_id: 6 },
    { id: 16, route_id: 4, trip_name: "trip-16", start_time: "05:00:00", end_time: "06:20:00", bus_id: 8 },
    { id: 17, route_id: 4, trip_name: "trip-17", start_time: "08:00:00", end_time: "09:20:00", bus_id: 8 },
    { id: 18, route_id: 4, trip_name: "trip-18", start_time: "11:00:00", end_time: "12:20:00", bus_id: 8 },
    { id: 19, route_id: 4, trip_name: "trip-19", start_time: "14:00:00", end_time: "15:20:00", bus_id: 8 },
    { id: 20, route_id: 4, trip_name: "trip-20", start_time: "17:00:00", end_time: "18:20:00", bus_id: 8 },
    { id: 21, route_id: 5, trip_name: "trip-21", start_time: "05:00:00", end_time: "06:00:00", bus_id: 9 },
    { id: 22, route_id: 5, trip_name: "trip-22", start_time: "08:00:00", end_time: "09:00:00", bus_id: 10 },
    { id: 23, route_id: 5, trip_name: "trip-23", start_time: "11:00:00", end_time: "12:00:00", bus_id: 9 },
    { id: 24, route_id: 5, trip_name: "trip-24", start_time: "14:00:00", end_time: "15:00:00", bus_id: 10 },
    { id: 25, route_id: 5, trip_name: "trip-25", start_time: "17:00:00", end_time: "18:00:00", bus_id: 9 }
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

        await pool.query("DELETE FROM trip_schedules;");
        console.log("  ✓ Cleared trip_schedules");

        await pool.query("DELETE FROM shedules;");
        console.log("  ✓ Cleared shedules");

        await pool.query("DELETE FROM users;");
        console.log("  ✓ Cleared users");

        await pool.query("UPDATE buses SET current_trip_id = NULL;");
        await pool.query("DELETE FROM buses;");
        console.log("  ✓ Cleared buses");

        await pool.query("DELETE FROM trips;");
        console.log("  ✓ Cleared trips");

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
        await pool.query("ALTER SEQUENCE trips_id_seq RESTART WITH 1;");
        await pool.query("ALTER SEQUENCE trip_schedules_id_seq RESTART WITH 1;");

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
            "INSERT INTO routes (id, route_number, name, start_city, end_city) VALUES ($1, $2, $3, $4, $5);",
            [route.id, route.route_number, route.name, route.start_city, route.end_city]
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
            "INSERT INTO buses (id, bus_number, route_id, status, current_trip_id) VALUES ($1, $2, $3, $4, $5);",
            [bus.id, bus.bus_number, bus.route_id, bus.status, bus.current_trip_id]
        );
    }

    console.log(`  ✓ Inserted ${BUSES_DATA.length} buses\n`);
}

async function seedUsers() {
    console.log("👥 Seeding users...");

    const userCount = 20;
    for (let i = 0; i < userCount; i++) {
        await pool.query(
            "INSERT INTO users (device_id, email, password_hash, username, role) VALUES ($1, $2, $3, $4, $5);",
            [generateDeviceId(), `user${i}@example.com`, `dummy_hash`, `User${i}`, `user`]
        );
    }

    console.log(`  ✓ Inserted ${userCount} users\n`);
}

async function seedTrips() {
    console.log("🚍 Seeding trips...");

    for (const trip of TRIPS_DATA) {
        await pool.query(
            "INSERT INTO trips (id, route_id, trip_name, start_time, end_time, bus_id) VALUES ($1, $2, $3, $4, $5, $6);",
            [trip.id, trip.route_id, trip.trip_name, trip.start_time, trip.end_time, trip.bus_id]
        );
    }

    console.log(`  ✓ Inserted ${TRIPS_DATA.length} trips\n`);
}

async function seedTripSchedules() {
    console.log("📆 Seeding trip schedules...");

    let scheduleCount = 0;

    for (const trip of TRIPS_DATA) {
        const routeStops = STOPS_DATA.filter(s => s.route_id === trip.route_id);

        // Parse start time to calculate stop times
        const [startHour, startMin] = trip.start_time.split(':').map(Number);
        let currentMinutes = startHour * 60 + startMin;

        for (let i = 0; i < routeStops.length; i++) {
            const stop = routeStops[i];
            const hours = Math.floor(currentMinutes / 60);
            const minutes = currentMinutes % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

            await pool.query(
                "INSERT INTO trip_schedules (trip_id, stop_id, scheduled_arrival_time, stop_sequence) VALUES ($1, $2, $3, $4);",
                [trip.id, stop.id, timeStr, i + 1]
            );
            scheduleCount++;

            currentMinutes += 12; // 12 minutes between stops
        }
    }

    console.log(`  ✓ Inserted ${scheduleCount} trip schedules\n`);
}

async function seedSchedules() {
    console.log("📅 Seeding schedules (legacy)...");

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

            // Safely map busId and stopId to our valid ranges (1-10 for buses, 1-25 for stops)
            const safeBusId = (parseInt(values[0]) % 10) + 1;
            const safeStopId = (parseInt(values[1]) % 25) + 1;
            const arrivalTime = parseInt(values[2]);

            // Skip invalid data
            if (!safeBusId || !safeStopId || !arrivalTime) {
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
                    [safeBusId, safeStopId, scheduledTime, delaySeconds, weather, trafficLevel, false, arrivedAt]
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
        await seedTrips();
        await seedUsers();
        await seedTripSchedules();  // New: seed trip schedules
        await seedSchedules();      // Legacy schedules (for backward compat)
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
            pool.query("SELECT COUNT(*) FROM trips"),
            pool.query("SELECT COUNT(*) FROM trip_schedules"),
            pool.query("SELECT COUNT(*) FROM shedules"),
            pool.query("SELECT COUNT(*) FROM segment_times"),
            pool.query("SELECT COUNT(*) FROM arrivals")
        ]);

        console.log("📊 Final row counts:");
        console.log(`   Routes:          ${counts[0].rows[0].count}`);
        console.log(`   Stops:           ${counts[1].rows[0].count}`);
        console.log(`   Buses:           ${counts[2].rows[0].count}`);
        console.log(`   Users:           ${counts[3].rows[0].count}`);
        console.log(`   Trips:           ${counts[4].rows[0].count}`);
        console.log(`   Trip Schedules:  ${counts[5].rows[0].count}`);
        console.log(`   Schedules:       ${counts[6].rows[0].count}`);
        console.log(`   Segment Times:   ${counts[7].rows[0].count}`);
        console.log(`   Arrivals:        ${counts[8].rows[0].count}`);
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
