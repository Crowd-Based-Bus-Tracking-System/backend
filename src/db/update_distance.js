/**
 * update_segment_distances.js
 *
 * Adds a `distance_meters` column to segment_times and populates it
 * using the Haversine straight-line distance between stop coordinates,
 * scaled by a per-route road-factor to match real Sri Lankan road distances.
 *
 * Usage:
 *   node update_segment_distances.js
 */

import pool from "../config/db.js";

// ---------------------------------------------------------------------------
// Stop coordinates (from stops_rows.sql)
// ---------------------------------------------------------------------------
const STOPS = {
  // Route 1 – Colombo Fort → Kandy (138)
  1:  { name: "Colombo Fort",   lat: 6.9344, lon: 79.8428 },
  2:  { name: "Kelaniya",       lat: 6.9553, lon: 79.9217 },
  3:  { name: "Kadawatha",      lat: 7.0013, lon: 79.9530 },
  4:  { name: "Nittambuwa",     lat: 7.1442, lon: 80.0953 },
  5:  { name: "Kegalle",        lat: 7.2530, lon: 80.3464 },
  6:  { name: "Mawanella",      lat: 7.2425, lon: 80.4440 },
  7:  { name: "Kadugannawa",    lat: 7.2547, lon: 80.5243 },
  8:  { name: "Peradeniya",     lat: 7.2690, lon: 80.5942 },
  9:  { name: "Kandy",          lat: 7.2906, lon: 80.6337 },
  // Route 2 – Colombo Fort → Galle (2)
  10: { name: "Colombo Fort",   lat: 6.9344, lon: 79.8428 },
  11: { name: "Dehiwala",       lat: 6.8528, lon: 79.8636 },
  12: { name: "Moratuwa",       lat: 6.7730, lon: 79.8816 },
  13: { name: "Panadura",       lat: 6.7136, lon: 79.9044 },
  14: { name: "Kalutara",       lat: 6.5854, lon: 79.9607 },
  15: { name: "Bentota",        lat: 6.4210, lon: 80.0004 },
  16: { name: "Ambalangoda",    lat: 6.2352, lon: 80.0540 },
  17: { name: "Hikkaduwa",      lat: 6.1390, lon: 80.1010 },
  18: { name: "Galle",          lat: 6.0535, lon: 80.2210 },
  // Route 3 – Colombo Fort → Jaffna (4)
  19: { name: "Colombo Fort",   lat: 6.9344, lon: 79.8428 },
  20: { name: "Kurunegala",     lat: 7.4863, lon: 80.3647 },
  21: { name: "Dambulla",       lat: 7.8742, lon: 80.6511 },
  22: { name: "Anuradhapura",   lat: 8.3114, lon: 80.4037 },
  23: { name: "Vavuniya",       lat: 8.7514, lon: 80.4997 },
  24: { name: "Kilinochchi",    lat: 9.3803, lon: 80.4036 },
  25: { name: "Elephant Pass",  lat: 9.5697, lon: 80.3800 },
  26: { name: "Jaffna",         lat: 9.6615, lon: 80.0255 },
  // Route 4 – Colombo Fort → Matara (99)
  27: { name: "Colombo Fort",   lat: 6.9344, lon: 79.8428 },
  28: { name: "Mount Lavinia",  lat: 6.8391, lon: 79.8656 },
  29: { name: "Moratuwa",       lat: 6.7730, lon: 79.8816 },
  30: { name: "Panadura",       lat: 6.7136, lon: 79.9044 },
  31: { name: "Kalutara",       lat: 6.5854, lon: 79.9607 },
  32: { name: "Aluthgama",      lat: 6.4342, lon: 80.0024 },
  33: { name: "Ambalangoda",    lat: 6.2352, lon: 80.0540 },
  34: { name: "Galle",          lat: 6.0535, lon: 80.2210 },
  35: { name: "Weligama",       lat: 5.9741, lon: 80.4296 },
  36: { name: "Matara",         lat: 5.9549, lon: 80.5550 },
  // Route 5 – Kandy → Nuwara Eliya (48)
  37: { name: "Kandy",          lat: 7.2906, lon: 80.6337 },
  38: { name: "Gampola",        lat: 7.1642, lon: 80.5767 },
  39: { name: "Nawalapitiya",   lat: 7.0489, lon: 80.5345 },
  40: { name: "Nuwara Eliya",   lat: 6.9497, lon: 80.7891 },
};

// Road-winding factors per route (road_distance ≈ straight_line × factor)
// Calibrated against known distances on these Sri Lankan routes:
//   Route 1 (138): A1 highway, moderate hills → 1.25
//   Route 2  (2):  Southern Expressway / coastal, fairly straight → 1.15
//   Route 3  (4):  Long north route, mixed terrain → 1.20
//   Route 4 (99):  Coastal + southern, similar to route 2 → 1.18
//   Route 5 (48):  Hill country, winding mountain roads → 1.55
const ROUTE_FACTORS = {
  1: 1.25,
  2: 1.15,
  3: 1.20,
  4: 1.18,
  5: 1.55,
};

// Segment → route mapping (segment_id: route_id)
const SEGMENT_ROUTES = {
  1:1,2:1,3:1,4:1,5:1,6:1,7:1,8:1,
  9:2,10:2,11:2,12:2,13:2,14:2,15:2,16:2,
  17:3,18:3,19:3,20:3,21:3,22:3,23:3,
  24:4,25:4,26:4,27:4,28:4,29:4,30:4,31:4,32:4,
  33:5,34:5,35:5,
};

// ---------------------------------------------------------------------------
// Haversine formula  →  metres
// ---------------------------------------------------------------------------
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ---------------------------------------------------------------------------
// Segment definitions  (id → from_stop_id, to_stop_id)
// ---------------------------------------------------------------------------
const SEGMENTS = [
  // Route 1
  { id: 1,  from: 1,  to: 2  },
  { id: 2,  from: 2,  to: 3  },
  { id: 3,  from: 3,  to: 4  },
  { id: 4,  from: 4,  to: 5  },
  { id: 5,  from: 5,  to: 6  },
  { id: 6,  from: 6,  to: 7  },
  { id: 7,  from: 7,  to: 8  },
  { id: 8,  from: 8,  to: 9  },
  // Route 2
  { id: 9,  from: 10, to: 11 },
  { id: 10, from: 11, to: 12 },
  { id: 11, from: 12, to: 13 },
  { id: 12, from: 13, to: 14 },
  { id: 13, from: 14, to: 15 },
  { id: 14, from: 15, to: 16 },
  { id: 15, from: 16, to: 17 },
  { id: 16, from: 17, to: 18 },
  // Route 3
  { id: 17, from: 19, to: 20 },
  { id: 18, from: 20, to: 21 },
  { id: 19, from: 21, to: 22 },
  { id: 20, from: 22, to: 23 },
  { id: 21, from: 23, to: 24 },
  { id: 22, from: 24, to: 25 },
  { id: 23, from: 25, to: 26 },
  // Route 4
  { id: 24, from: 27, to: 28 },
  { id: 25, from: 28, to: 29 },
  { id: 26, from: 29, to: 30 },
  { id: 27, from: 30, to: 31 },
  { id: 28, from: 31, to: 32 },
  { id: 29, from: 32, to: 33 },
  { id: 30, from: 33, to: 34 },
  { id: 31, from: 34, to: 35 },
  { id: 32, from: 35, to: 36 },
  // Route 5
  { id: 33, from: 37, to: 38 },
  { id: 34, from: 38, to: 39 },
  { id: 35, from: 39, to: 40 },
];

// ---------------------------------------------------------------------------
// Compute road distances
// ---------------------------------------------------------------------------
function computeDistances() {
  return SEGMENTS.map((seg) => {
    const from = STOPS[seg.from];
    const to   = STOPS[seg.to];
    const routeId = SEGMENT_ROUTES[seg.id];
    const factor = ROUTE_FACTORS[routeId] ?? 1.25;
    const straight = haversineMeters(from.lat, from.lon, to.lat, to.lon);
    const road = Math.round(straight * factor);
    return { id: seg.id, from: from.name, to: to.name, straight, road };
  });
}

// ---------------------------------------------------------------------------
// Quick sanity-check print
// ---------------------------------------------------------------------------
function printSummary(distances) {
  console.log("\n📍 Segment distance preview (straight-line → road estimate):\n");
  console.log(
    "ID".padEnd(4),
    "From".padEnd(18),
    "To".padEnd(18),
    "Straight (m)".padEnd(14),
    "Road (m)"
  );
  console.log("─".repeat(72));
  distances.forEach((d) => {
    console.log(
      String(d.id).padEnd(4),
      d.from.padEnd(18),
      d.to.padEnd(18),
      String(d.straight).padEnd(14),
      d.road
    );
  });
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const distances = computeDistances();
  printSummary(distances);

  const client = await pool.connect();

  try {
    // 1. Add column (idempotent)
    await client.query(`
      ALTER TABLE segment_times
      ADD COLUMN IF NOT EXISTS distance_in_meters INT;
    `);
    console.log("✅  Column distance_in_meters ensured\n");

    // 2. Update each segment in a single transaction
    await client.query("BEGIN");
    for (const d of distances) {
      await client.query(
        `UPDATE segment_times SET distance_meters = $1 WHERE id = $2`,
        [d.road, d.id]
      );
      console.log(`   ↳ segment ${d.id}: ${d.from} → ${d.to} = ${d.road} m`);
    }
    await client.query("COMMIT");

    // 3. Verify
    const { rows } = await client.query(`
      SELECT id, distance_meters FROM segment_times ORDER BY id
    `);
    const nulls = rows.filter((r) => r.distance_meters === null);
    if (nulls.length) {
      console.warn(`\n⚠️  ${nulls.length} rows still have NULL distance_meters:`, nulls.map((r) => r.id));
    } else {
      console.log(`\n✅  All ${rows.length} segments updated successfully.`);
    }

    // 4. Add a useful index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_segment_times_distance
        ON segment_times(route_id, distance_meters);
    `);
    console.log("✅  Index on (route_id, distance_meters) ensured\n");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();