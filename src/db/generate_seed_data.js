import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routes = [
    {
        id: "route-1", dbId: 1, routeNumber: "138", name: "Colombo - Kandy", from: "Colombo Fort", to: "Kandy",
        stops: [
            { id: "s1", dbId: 1, name: "Colombo Fort", lat: 6.9344, lng: 79.8428 },
            { id: "s2", dbId: 2, name: "Kadawatha", lat: 7.0013, lng: 79.9530 },
            { id: "s3", dbId: 3, name: "Kadugannawa", lat: 7.2547, lng: 80.5243 },
            { id: "s4", dbId: 4, name: "Peradeniya", lat: 7.2690, lng: 80.5942 },
            { id: "s5", dbId: 5, name: "Kandy", lat: 7.2906, lng: 80.6337 },
        ],
        buses: [
            { id: "b1", dbId: 1, plateNumber: "NB-1234" },
            { id: "b2", dbId: 2, plateNumber: "NC-5678" },
            { id: "b3", dbId: 3, plateNumber: "WP-9012" }
        ]
    },
    {
        id: "route-2", dbId: 2, routeNumber: "2", name: "Colombo - Galle", from: "Colombo Fort", to: "Galle",
        stops: [
            { id: "s6", dbId: 6, name: "Colombo Fort", lat: 6.9344, lng: 79.8428 },
            { id: "s7", dbId: 7, name: "Moratuwa", lat: 6.7730, lng: 79.8816 },
            { id: "s8", dbId: 8, name: "Panadura", lat: 6.7136, lng: 79.9044 },
            { id: "s9", dbId: 9, name: "Ambalangoda", lat: 6.2352, lng: 80.0540 },
            { id: "s10", dbId: 10, name: "Galle", lat: 6.0535, lng: 80.2210 },
        ],
        buses: [
            { id: "b4", dbId: 4, plateNumber: "SP-3456" },
            { id: "b5", dbId: 5, plateNumber: "SP-7890" },
        ]
    },
    {
        id: "route-3", dbId: 3, routeNumber: "4", name: "Colombo - Jaffna", from: "Colombo Fort", to: "Jaffna",
        stops: [
            { id: "s11", dbId: 11, name: "Colombo Fort", lat: 6.9344, lng: 79.8428 },
            { id: "s12", dbId: 12, name: "Kurunegala", lat: 7.4863, lng: 80.3623 },
            { id: "s13", dbId: 13, name: "Dambulla", lat: 7.8742, lng: 80.6511 },
            { id: "s14", dbId: 14, name: "Anuradhapura", lat: 8.3114, lng: 80.4037 },
            { id: "s15", dbId: 15, name: "Kilinochchi", lat: 9.3803, lng: 80.3770 },
            { id: "s16", dbId: 16, name: "Jaffna", lat: 9.6615, lng: 80.0255 },
        ],
        buses: [
            { id: "b6", dbId: 6, plateNumber: "NP-1111" },
            { id: "b7", dbId: 7, plateNumber: "NP-2222" },
        ]
    },
    {
        id: "route-4", dbId: 4, routeNumber: "99", name: "Colombo - Matara", from: "Colombo Fort", to: "Matara",
        stops: [
            { id: "s17", dbId: 17, name: "Colombo Fort", lat: 6.9344, lng: 79.8428 },
            { id: "s18", dbId: 18, name: "Panadura", lat: 6.7136, lng: 79.9044 },
            { id: "s19", dbId: 19, name: "Galle", lat: 6.0535, lng: 80.2210 },
            { id: "s20", dbId: 20, name: "Weligama", lat: 5.9745, lng: 80.4296 },
            { id: "s21", dbId: 21, name: "Matara", lat: 5.9549, lng: 80.5550 },
        ],
        buses: [
            { id: "b8", dbId: 8, plateNumber: "SG-4444" },
        ]
    },
    {
        id: "route-5", dbId: 5, routeNumber: "48", name: "Kandy - Nuwara Eliya", from: "Kandy", to: "Nuwara Eliya",
        stops: [
            { id: "s22", dbId: 22, name: "Kandy", lat: 7.2906, lng: 80.6337 },
            { id: "s23", dbId: 23, name: "Gampola", lat: 7.1642, lng: 80.5767 },
            { id: "s24", dbId: 24, name: "Nawalapitiya", lat: 7.0489, lng: 80.5345 },
            { id: "s25", dbId: 25, name: "Nuwara Eliya", lat: 6.9497, lng: 80.7891 },
        ],
        buses: [
            { id: "b9", dbId: 9, plateNumber: "CP-5555" },
            { id: "b10", dbId: 10, plateNumber: "CP-6666" },
        ]
    }
];

// Helper to add minutes to time
function addMinutes(timeStr, mins) {
    let [h, m] = timeStr.split(':').map(Number);
    m += mins;
    h += Math.floor(m / 60);
    m = m % 60;
    h = h % 24;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const GLOBAL_TRIPS = [];
let tripIdCounter = 1;

routes.forEach(route => {
    route.trips = [];
    const startHours = ["05:00", "08:00", "11:00", "14:00", "17:00"];
    // Assign buses circularly
    startHours.forEach((startTime, idx) => {
        const bus = route.buses[idx % route.buses.length];

        let current_time = startTime;
        const stopSchedules = route.stops.map((stop, s_idx) => {
            let arrival = current_time;
            current_time = addMinutes(current_time, 20); // 20 mins between stops
            return { stopId: stop.id, dbId: stop.dbId, arrivalTime: arrival };
        });

        let endTime = stopSchedules[stopSchedules.length - 1].arrivalTime;

        const trip = {
            tripId: `trip-${tripIdCounter}`,
            dbId: tripIdCounter,
            busId: bus.id,
            busDbId: bus.dbId,
            departureTime: startTime,
            arrivalTime: endTime,
            busType: idx % 2 === 0 ? "express" : "normal",
            stopSchedules: stopSchedules
        };
        route.trips.push(trip);
        GLOBAL_TRIPS.push({ ...trip, routeId: route.id, routeDbId: route.dbId });
        tripIdCounter++;
    });
});

const timetablesFile = `export interface StopSchedule {
  stopId: string;
  arrivalTime: string;
}

export interface TimetableEntry {
  tripId: string;
  busId: string;
  departureTime: string;
  arrivalTime: string;
  busType: "express" | "normal" | "semi-luxury";
  stopSchedules: StopSchedule[];
}

export interface RouteTimetable {
  routeId: string;
  weekday: TimetableEntry[];
  weekend: TimetableEntry[];
}

export const timetables: Record<string, RouteTimetable> = {
${routes.map(r => `
  "${r.id}": {
    routeId: "${r.id}",
    weekday: ${JSON.stringify(r.trips.map(t => ({
    tripId: t.tripId,
    busId: t.busId,
    departureTime: t.departureTime,
    arrivalTime: t.arrivalTime,
    busType: t.busType,
    stopSchedules: t.stopSchedules.map(ss => ({ stopId: ss.stopId, arrivalTime: ss.arrivalTime }))
})), null, 6)},
    weekend: ${JSON.stringify(r.trips.slice(0, 3).map(t => ({
    tripId: t.tripId,
    busId: t.busId,
    departureTime: t.departureTime,
    arrivalTime: t.arrivalTime,
    busType: t.busType,
    stopSchedules: t.stopSchedules.map(ss => ({ stopId: ss.stopId, arrivalTime: ss.arrivalTime }))
})), null, 6)}
  },
`).join('')}
};
`;

fs.writeFileSync(path.join(__dirname, "../../../frontend/src/data/timetable.ts"), timetablesFile);

const seedJsRoutesData = routes.map(r =>
    `    { id: ${r.dbId}, route_number: "${r.routeNumber}", name: "${r.name}", start_city: "${r.from}", end_city: "${r.to}" }`
).join(",\n");

const seedJsStopsData = routes.flatMap(r =>
    r.stops.map((s, idx) => `    { id: ${s.dbId}, route_id: ${r.dbId}, name: "${s.name}", latitude: ${s.lat}, longitude: ${s.lng}, sequence: ${idx + 1} }`)
).join(",\n");

const seedJsBusesData = routes.flatMap(r =>
    r.buses.map(b => `    { id: ${b.dbId}, bus_number: "${b.plateNumber}", route_id: ${r.dbId}, status: "ACTIVE", current_trip_id: null }`)
).join(",\n");

const seedJsTripsData = GLOBAL_TRIPS.map(t =>
    `    { id: ${t.dbId}, route_id: ${t.routeDbId}, trip_name: "${t.tripId}", start_time: "${t.departureTime}:00", end_time: "${t.arrivalTime}:00", bus_id: ${t.busDbId} }`
).join(",\n");

// For trip_schedules
const seedJsTripSchedulesData = GLOBAL_TRIPS.flatMap(t =>
    t.stopSchedules.map((ss, idx) =>
        `    { trip_id: ${t.dbId}, stop_id: ${ss.dbId}, scheduled_arrival_time: "${ss.arrivalTime}:00", stop_sequence: ${idx + 1} }`
    )
).join(",\n");

fs.writeFileSync(path.join(__dirname, "seedDataGenerated.json"), JSON.stringify({
    ROUTES_DATA: seedJsRoutesData,
    STOPS_DATA: seedJsStopsData,
    BUSES_DATA: seedJsBusesData,
    TRIPS_DATA: seedJsTripsData,
    TRIP_SCHEDULES: seedJsTripSchedulesData
}, null, 2));

console.log("Files generated!");
