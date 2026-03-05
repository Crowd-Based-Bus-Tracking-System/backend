import pool from "../config/db.js";

/* ═══════════════════════════ helpers ═══════════════════════════ */

const rand     = (a, b) => Math.random() * (b - a) + a;
const randInt  = (a, b) => Math.floor(rand(a, b));
const choice   = (arr)  => arr[randInt(0, arr.length)];
const clamp    = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Box-Muller: normally distributed sample */
function randNormal(mean, std) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Pad time components for SQL TIME strings */
function pad2(n) { return String(n).padStart(2, "0"); }
function toTimeStr(h, m) { return `${pad2(Math.min(h, 23))}:${pad2(m % 60)}`; }

/* ═══════════════════════════ static reference data ═══════════════════════════ */

const ROUTES = [
  { id: 1, number: "138", name: "Colombo - Kandy",       start: "Colombo Fort", end: "Kandy"        },
  { id: 2, number: "2",   name: "Colombo - Galle",       start: "Colombo Fort", end: "Galle"        },
  { id: 3, number: "4",   name: "Colombo - Jaffna",      start: "Colombo Fort", end: "Jaffna"       },
  { id: 4, number: "99",  name: "Colombo - Matara",      start: "Colombo Fort", end: "Matara"       },
  { id: 5, number: "48",  name: "Kandy - Nuwara Eliya",  start: "Kandy",        end: "Nuwara Eliya" },
];

/**
 * roadType drives realistic speed envelopes:
 *   highway  → 65–85 km/h  (expressway stretches)
 *   main     → 38–60 km/h  (A-roads between towns)
 *   mountain → 16–30 km/h  (B-road hill country)
 *   city     → 10–22 km/h  (urban congestion)
 */
const STOPS_DATA = [
  // ── Route 1: Colombo Fort → Kandy (A1 then Kadugannawa mountain pass)
  { route:1, name:"Colombo Fort",  lat:6.9344, lon:79.8428, roadType:"city"     },
  { route:1, name:"Kelaniya",      lat:6.9553, lon:79.9217, roadType:"city"     },
  { route:1, name:"Kadawatha",     lat:7.0013, lon:79.9530, roadType:"main"     },
  { route:1, name:"Nittambuwa",    lat:7.1442, lon:80.0953, roadType:"main"     },
  { route:1, name:"Kegalle",       lat:7.2530, lon:80.3464, roadType:"main"     },
  { route:1, name:"Mawanella",     lat:7.2425, lon:80.4440, roadType:"mountain" },
  { route:1, name:"Kadugannawa",   lat:7.2547, lon:80.5243, roadType:"mountain" },
  { route:1, name:"Peradeniya",    lat:7.2690, lon:80.5942, roadType:"mountain" },
  { route:1, name:"Kandy",         lat:7.2906, lon:80.6337, roadType:"city"     },

  // ── Route 2: Colombo Fort → Galle (A2 coastal road)
  { route:2, name:"Colombo Fort",  lat:6.9344, lon:79.8428, roadType:"city"    },
  { route:2, name:"Dehiwala",      lat:6.8528, lon:79.8636, roadType:"city"    },
  { route:2, name:"Moratuwa",      lat:6.7730, lon:79.8816, roadType:"main"    },
  { route:2, name:"Panadura",      lat:6.7136, lon:79.9044, roadType:"main"    },
  { route:2, name:"Kalutara",      lat:6.5854, lon:79.9607, roadType:"main"    },
  { route:2, name:"Bentota",       lat:6.4210, lon:80.0004, roadType:"highway" },
  { route:2, name:"Ambalangoda",   lat:6.2352, lon:80.0540, roadType:"highway" },
  { route:2, name:"Hikkaduwa",     lat:6.1390, lon:80.1010, roadType:"main"    },
  { route:2, name:"Galle",         lat:6.0535, lon:80.2210, roadType:"city"    },

  // ── Route 3: Colombo Fort → Jaffna (A9 north highway)
  { route:3, name:"Colombo Fort",  lat:6.9344, lon:79.8428, roadType:"city" },
  { route:3, name:"Kurunegala",    lat:7.4863, lon:80.3647, roadType:"main" },
  { route:3, name:"Dambulla",      lat:7.8742, lon:80.6511, roadType:"main" },
  { route:3, name:"Anuradhapura",  lat:8.3114, lon:80.4037, roadType:"main" },
  { route:3, name:"Vavuniya",      lat:8.7514, lon:80.4997, roadType:"main" },
  { route:3, name:"Kilinochchi",   lat:9.3803, lon:80.4036, roadType:"main" },
  { route:3, name:"Elephant Pass", lat:9.5697, lon:80.3800, roadType:"main" },
  { route:3, name:"Jaffna",        lat:9.6615, lon:80.0255, roadType:"city" },

  // ── Route 4: Colombo Fort → Matara (A2 extended south coast)
  { route:4, name:"Colombo Fort",  lat:6.9344, lon:79.8428, roadType:"city"    },
  { route:4, name:"Mount Lavinia", lat:6.8391, lon:79.8656, roadType:"city"    },
  { route:4, name:"Moratuwa",      lat:6.7730, lon:79.8816, roadType:"main"    },
  { route:4, name:"Panadura",      lat:6.7136, lon:79.9044, roadType:"main"    },
  { route:4, name:"Kalutara",      lat:6.5854, lon:79.9607, roadType:"main"    },
  { route:4, name:"Aluthgama",     lat:6.4342, lon:80.0024, roadType:"main"    },
  { route:4, name:"Ambalangoda",   lat:6.2352, lon:80.0540, roadType:"main"    },
  { route:4, name:"Galle",         lat:6.0535, lon:80.2210, roadType:"city"    },
  { route:4, name:"Weligama",      lat:5.9741, lon:80.4296, roadType:"main"    },
  { route:4, name:"Matara",        lat:5.9549, lon:80.5550, roadType:"city"    },

  // ── Route 5: Kandy → Nuwara Eliya (B-road hill country)
  { route:5, name:"Kandy",         lat:7.2906, lon:80.6337, roadType:"city"     },
  { route:5, name:"Gampola",       lat:7.1642, lon:80.5767, roadType:"mountain" },
  { route:5, name:"Nawalapitiya",  lat:7.0489, lon:80.5345, roadType:"mountain" },
  { route:5, name:"Nuwara Eliya",  lat:6.9497, lon:80.7891, roadType:"mountain" },
];

// km/h speed envelope [min, max] per road type
const ROAD_SPEEDS = {
  highway:  [65, 85],
  main:     [38, 60],
  mountain: [16, 30],
  city:     [10, 22],
};

/**
 * Sri Lanka monthly rain probability [Jan=0 … Dec=11].
 * SW monsoon peaks Jun-Sep; NE monsoon Nov-Jan; inter-monsoon Apr-May & Oct.
 */
const MONTHLY_RAIN_PROB = [0.30, 0.15, 0.12, 0.22, 0.40, 0.58, 0.65, 0.60, 0.48, 0.44, 0.42, 0.35];

/**
 * Known recurring event dates that cause stop-level congestion.
 * month is 0-indexed. extraDelaySec = mean extra seconds added at that stop.
 */
const ANNUAL_EVENTS = [
  // Kandy Esala Perahera (August)
  { month:7, day:5,  stop:"Kandy",        extraDelaySec:900  },
  { month:7, day:6,  stop:"Kandy",        extraDelaySec:1200 },
  { month:7, day:7,  stop:"Kandy",        extraDelaySec:1500 },
  { month:7, day:8,  stop:"Kandy",        extraDelaySec:1200 },
  { month:7, day:9,  stop:"Kandy",        extraDelaySec:900  },
  // Sinhala & Tamil New Year (April 13-14)
  { month:3, day:13, stop:"Colombo Fort", extraDelaySec:1100 },
  { month:3, day:14, stop:"Colombo Fort", extraDelaySec:1100 },
  // Thai Pongal (January 15)
  { month:0, day:15, stop:"Colombo Fort", extraDelaySec:600  },
  // Deepavali (November)
  { month:10, day:5, stop:"Jaffna",       extraDelaySec:700  },
  // Christmas (December 25)
  { month:11, day:25,stop:"Colombo Fort", extraDelaySec:450  },
  // Galle Literary Festival (January)
  { month:0, day:20, stop:"Galle",        extraDelaySec:500  },
  // Nuwara Eliya Hill Country Festival (September)
  { month:8, day:18, stop:"Nuwara Eliya", extraDelaySec:500  },
  // Anuradhapura Poson Poya (June)
  { month:5, day:3,  stop:"Anuradhapura", extraDelaySec:800  },
  { month:5, day:4,  stop:"Anuradhapura", extraDelaySec:800  },
];

/* ═══════════════════════════ seed: static tables ═══════════════════════════ */

async function seedRoutes() {
  for (const r of ROUTES) {
    await pool.query(
      `INSERT INTO routes(id, route_number, name, start_city, end_city)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [r.id, r.number, r.name, r.start, r.end]
    );
  }
  console.log("  routes ✓");
}

async function seedStops() {
  const seq = {};
  for (const s of STOPS_DATA) {
    if (!seq[s.route]) seq[s.route] = 1;
    await pool.query(
      `INSERT INTO stops(route_id, name, latitude, longitude, sequence) VALUES($1,$2,$3,$4,$5)`,
      [s.route, s.name, s.lat, s.lon, seq[s.route]++]
    );
  }
  console.log("  stops ✓");
}

async function seedBuses() {
  let id = 1;
  for (let route = 1; route <= 5; route++) {
    for (let i = 0; i < 2; i++) {
      await pool.query(
        `INSERT INTO buses(id, bus_number, route_id, status) VALUES($1,$2,$3,'ACTIVE')`,
        [id, `BUS-${route}-${i}`, route]
      );
      id++;
    }
  }
  console.log("  buses ✓");
}

async function seedSegmentTimes() {
  const { rows: stops } = await pool.query(`SELECT * FROM stops ORDER BY route_id, sequence`);

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i], s2 = stops[i + 1];
    if (s1.route_id !== s2.route_id) continue;

    const meta = STOPS_DATA.find(
      (s) => s.route === s1.route_id && s.name === s1.name
    );
    const roadType = meta ? meta.roadType : "main";
    const [sMin, sMax] = ROAD_SPEEDS[roadType];

    const dist   = haversine(+s1.latitude, +s1.longitude, +s2.latitude, +s2.longitude);
    const speed  = rand(sMin, sMax);
    const avgSec = Math.round((dist / speed) * 3600);
    // stddev: city roads noisier; mountain roads very noisy
    const stddevFrac = roadType === "city" ? rand(0.15, 0.28) :
                       roadType === "mountain" ? rand(0.20, 0.35) : rand(0.08, 0.18);
    const stddev = Math.round(avgSec * stddevFrac);

    await pool.query(
      `INSERT INTO segment_times(route_id, from_stop_id, to_stop_id,
         avg_travel_seconds, stddev_travel_seconds, sample_count)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [s1.route_id, s1.id, s2.id, avgSec, stddev, randInt(200, 900)]
    );
  }
  console.log("  segment_times ✓");
}

async function seedTrips() {
  const { rows: buses } = await pool.query(`SELECT * FROM buses`);
  for (const bus of buses) {
    for (let i = 0; i < 12; i++) {
      const h = 5 + i;
      await pool.query(
        `INSERT INTO trips(route_id, bus_id, trip_name, start_time, end_time) VALUES($1,$2,$3,$4,$5)`,
        [bus.route_id, bus.id, `Trip-${bus.id}-${i}`, `${pad2(h)}:00`, `${pad2(h + 4)}:00`]
      );
    }
  }
  console.log("  trips ✓");
}

async function seedTripSchedules() {
  const { rows: trips } = await pool.query(`SELECT * FROM trips`);
  const { rows: stops } = await pool.query(`SELECT * FROM stops`);
  for (const trip of trips) {
    const routeStops = stops.filter((s) => s.route_id === trip.route_id);
    for (const stop of routeStops) {
      const mins = stop.sequence * 20;
      await pool.query(
        `INSERT INTO trip_schedules(trip_id, stop_id, scheduled_arrival_time, stop_sequence)
         VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [trip.id, stop.id, toTimeStr(6 + Math.floor(mins / 60), mins % 60), stop.sequence]
      );
    }
  }
  console.log("  trip_schedules ✓");
}

async function seedSchedules() {
  const { rows: stops } = await pool.query(`SELECT * FROM stops`);
  for (const stop of stops) {
    await pool.query(
      `INSERT INTO shedules(route_id, stop_id, sheduled_arrival_time, day_type) VALUES($1,$2,$3,'weekday')`,
      [stop.route_id, stop.id, `${pad2(6 + stop.sequence)}:00`]
    );
  }
  console.log("  shedules ✓");
}

/* ═══════════════════════════ arrivals: realistic simulation ═══════════════════════════ */

/**
 * Returns a delay-scaling multiplier for the given hour of day.
 * Models morning rush, lunch bump, and evening rush.
 */
function rushMultiplier(hour, minute = 0) {
  const t = hour + minute / 60;
  if (t >= 7.0  && t <= 9.5)  return rand(1.8, 3.5);  // morning rush
  if (t >= 11.5 && t <= 13.0) return rand(1.1, 1.4);  // lunch
  if (t >= 16.0 && t <= 19.5) return rand(1.5, 3.0);  // evening rush
  if (t < 6.5)                return rand(0.5, 0.85); // early morning – sparse traffic
  return 1.0;
}

/**
 * Additional delay (seconds) caused by weather on a given road type.
 */
function weatherDelaySec(weather, roadType) {
  const base = {
    heavy_rain: { city: rand(90, 240), main: rand(60, 150), mountain: rand(120, 320), highway: rand(40, 100) },
    rain:       { city: rand(30, 90),  main: rand(20, 70),  mountain: rand(50, 150), highway: rand(15, 45)  },
    cloudy:     { city: rand(0, 15),   main: rand(0, 10),   mountain: rand(0, 20),   highway: rand(0, 8)   },
    clear:      { city: 0,             main: 0,             mountain: 0,             highway: 0            },
  };
  return (base[weather] || base.clear)[roadType] || 0;
}

async function seedArrivals() {
  const { rows: buses } = await pool.query(`SELECT * FROM buses`);
  const { rows: allStops } = await pool.query(`SELECT * FROM stops ORDER BY route_id, sequence`);
  const { rows: segments } = await pool.query(`SELECT * FROM segment_times`);

  // segment lookup: "routeId_fromStopId" → segment row
  const segMap = {};
  for (const seg of segments) segMap[`${seg.route_id}_${seg.from_stop_id}`] = seg;

  // stops grouped by route_id
  const stopsByRoute = {};
  for (const s of allStops) {
    (stopsByRoute[s.route_id] ??= []).push(s);
  }

  // Trip start hours (templates); weekends drop off-peak slots
  const WEEKDAY_STARTS = [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
  const WEEKEND_STARTS = [6,8,10,12,14,16,18,20];

  // Build event lookup: "month_day" → [{ stop, extraDelaySec }]
  const eventMap = {};
  for (const ev of ANNUAL_EVENTS) {
    const key = `${ev.month}_${ev.day}`;
    (eventMap[key] ??= []).push(ev);
  }

  const NUM_DAYS  = 60;              // 60 days ≈ 130k+ arrivals
  const BASE_DATE = new Date("2024-07-01T00:00:00Z");
  const BATCH     = 1000;
  let batch = [], total = 0;

  async function flushBatch() {
    if (!batch.length) return;
    const placeholders = [];
    const params = [];
    let p = 1;
    for (const row of batch) {
      placeholders.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7})`);
      params.push(...row);
      p += 8;
    }
    await pool.query(
      `INSERT INTO arrivals(bus_id,stop_id,scheduled_time,delay_seconds,
         weather,traffic_level,event_nearby,arrived_at)
       VALUES ${placeholders.join(",")}`,
      params
    );
    batch = [];
  }

  for (let day = 0; day < NUM_DAYS; day++) {
    const date = new Date(BASE_DATE);
    date.setUTCDate(BASE_DATE.getUTCDate() + day);

    const month      = date.getUTCMonth();   // 0-11
    const dayOfMonth = date.getUTCDate();
    const dayOfWeek  = date.getUTCDay();     // 0=Sun
    const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;

    /* ── Day-level weather ── */
    const rainProb = MONTHLY_RAIN_PROB[month];
    const rw = Math.random();
    const dayWeather =
      rw < rainProb * 0.30 ? "heavy_rain" :
      rw < rainProb        ? "rain"       :
      rw < rainProb + 0.20 ? "cloudy"     : "clear";

    /* ── Events active today ── */
    const todayEvents = eventMap[`${month}_${dayOfMonth}`] || [];

    const tripStarts = isWeekend ? WEEKEND_STARTS : WEEKDAY_STARTS;

    for (const bus of buses) {
      const routeStops = stopsByRoute[bus.route_id];
      if (!routeStops || !routeStops.length) continue;

      for (const startHour of tripStarts) {

        /* ─────────────────────────────────────────────────────────────────
         *  TRIP SIMULATION — propagating delay model
         *
         *  runningDelay represents the bus's accumulated lateness (seconds).
         *  At each stop the bus inherits delay from the previous stop
         *  (wave propagation), plus per-segment noise, weather impact, rush
         *  hour pressure, and random incidents.  Natural recovery at stops
         *  (passengers board/alight, driver catches up) is modelled by a
         *  small damping factor.
         * ───────────────────────────────────────────────────────────────── */
        let runningDelay = randNormal(0, 45); // small departure variance

        for (let si = 0; si < routeStops.length; si++) {
          const stop = routeStops[si];

          const meta = STOPS_DATA.find(
            (s) => s.route === bus.route_id && s.name === stop.name
          );
          const roadType = meta ? meta.roadType : "main";

          // Scheduled time for this stop on this trip
          const schedMins = stop.sequence * 18;                  // ~18 min avg dwell between stops
          const schedH    = startHour + Math.floor(schedMins / 60);
          const schedM    = schedMins % 60;
          const scheduledTimeStr = toTimeStr(schedH, schedM);

          // Rush factor at the scheduled hour
          const rush = rushMultiplier(schedH, schedM);

          // Weather-induced segment delay
          const wDelay = weatherDelaySec(dayWeather, roadType);

          // Segment-specific noise (uses stddev from segment_times)
          const seg = segMap[`${bus.route_id}_${stop.id}`];
          const segStd = seg ? +seg.stddev_travel_seconds : 90;
          let segNoise = randNormal(0, segStd * 0.25) * rush;

          // Random incidents: breakdown/accident ~0.4 % per stop-visit
          if (Math.random() < 0.004) {
            segNoise += randInt(300, 1200); // 5–20 min incident
          }

          // Accumulate
          runningDelay += segNoise + wDelay;

          /* ── Event spike at this stop ── */
          const ev = todayEvents.find((e) => e.stop === stop.name);
          let eventNearby = false;
          if (ev) {
            eventNearby = true;
            runningDelay += ev.extraDelaySec * rand(0.6, 1.4);
          }

          /* ── Natural recovery at stop (passengers, driver catch-up) ── */
          if (si === 0) {
            // At origin: clamp initial delay, fresh departure
            runningDelay = clamp(runningDelay, -90, 180);
          } else if (runningDelay > 0) {
            // Each stop absorbs ~5-14 % of accumulated delay
            runningDelay *= rand(0.86, 0.95);
          } else {
            // Early buses slow down slightly to respect schedule
            runningDelay = clamp(runningDelay, -120, 0);
          }

          const finalDelay = Math.round(runningDelay);

          /* ── Derive traffic_level from conditions ── */
          const trafficLevel =
            rush > 2.5 || finalDelay > 600 ? "high"   :
            rush > 1.5 || finalDelay > 200 ? "medium" : "low";

          /* ── Build arrived_at timestamp ── */
          const arrivedAt = new Date(date);
          arrivedAt.setUTCHours(schedH % 24, schedM, 0, 0);
          arrivedAt.setUTCSeconds(arrivedAt.getUTCSeconds() + Math.max(finalDelay, -300));

          batch.push([
            bus.id,
            stop.id,
            scheduledTimeStr,
            finalDelay,
            dayWeather,
            trafficLevel,
            eventNearby,
            arrivedAt.toISOString(),
          ]);
          total++;
        } // stops loop

        if (batch.length >= BATCH) await flushBatch();
      } // trip starts loop
    } // buses loop

    if (day % 5 === 0) {
      await flushBatch();
      process.stdout.write(`\r  arrivals: day ${day + 1}/${NUM_DAYS}  (${total.toLocaleString()} rows)`);
    }
  } // days loop

  await flushBatch();
  console.log(`\n  arrivals ✓  total = ${total.toLocaleString()}`);
}

/* ═══════════════════════════ occupancy: realistic ═══════════════════════════ */

async function seedOccupancy() {
  const { rows: buses } = await pool.query(`SELECT * FROM buses`);
  const { rows: allStops } = await pool.query(`SELECT * FROM stops`);

  const stopsByRoute = {};
  for (const s of allStops) (stopsByRoute[s.route_id] ??= []).push(s);

  const BATCH = 500, TOTAL = 30_000;
  let batch = [], total = 0;

  async function flush() {
    if (!batch.length) return;
    const ph = [], params = [];
    let p = 1;
    for (const r of batch) {
      ph.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10})`);
      params.push(...r);
      p += 11;
    }
    await pool.query(
      `INSERT INTO occupancy_reports(bus_id,stop_id,occupancy_level,reporter_count,
         avg_reporter_accuracy,scheduled_time,weather,traffic_level,
         hour_of_day,day_of_week,is_rush_hour)
       VALUES ${ph.join(",")}`,
      params
    );
    batch = [];
  }

  for (let i = 0; i < TOTAL; i++) {
    const bus       = choice(buses);
    const stops     = stopsByRoute[bus.route_id] || allStops;
    const stop      = choice(stops);
    const hour      = randInt(5, 22);
    const dow       = randInt(0, 7);
    const isRush    = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);

    /* Occupancy level 1-5 biased by time-of-day */
    let level;
    if (isRush)           level = Math.random() < 0.65 ? randInt(4, 6) : randInt(2, 5);
    else if (hour < 7 || hour > 20) level = randInt(1, 3);
    else                  level = randInt(1, 5);
    level = clamp(level, 1, 5);

    const rain    = Math.random() < 0.30;
    const weather = rain ? choice(["rain","heavy_rain"]) : choice(["clear","cloudy"]);

    batch.push([
      bus.id,
      stop.id,
      level,
      randInt(1, 6),
      +rand(0.3, 1.0).toFixed(4),
      toTimeStr(hour, randInt(0, 60)),
      weather,
      isRush ? choice(["medium","high"]) : choice(["low","medium"]),
      hour,
      dow,
      isRush,
    ]);
    total++;
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  console.log(`  occupancy ✓  total = ${total.toLocaleString()}`);
}

/* ═══════════════════════════ clean slate ═══════════════════════════ */

async function cleanDatabase() {
  // Drop in reverse FK dependency order, then reset sequences
  await pool.query(`
    TRUNCATE TABLE
      occupancy_reports,
      arrivals,
      shedules,
      trip_schedules,
      segment_times,
      trips,
      buses,
      stops,
      routes
    RESTART IDENTITY CASCADE;
  `);
  console.log("  database cleaned ✓");
}

/* ═══════════════════════════ entry point ═══════════════════════════ */

async function main() {
  console.log("\n── cleaning existing data ──");
  await cleanDatabase();

  console.log("\n── seeding static tables ──");
  await seedRoutes();
  await seedStops();
  await seedBuses();
  await seedSegmentTimes();
  await seedTrips();
  await seedTripSchedules();
  await seedSchedules();

  console.log("\n── simulating 60-day operation (≈130k arrivals) ──");
  await seedArrivals();

  console.log("\n── seeding occupancy reports ──");
  await seedOccupancy();

  console.log("\n✓ all done");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });