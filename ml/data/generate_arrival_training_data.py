"""
generate_arrivals_csv.py
────────────────────────
Generates a realistic arrival-confirmation training dataset consistent with
the bus_system database seeded by seed.js.

Target column: confirm_prob  (float 0–1)
  → Probability that a crowd-reported bus arrival is genuinely real.

Realism design:
  • confirm_prob is driven by the same crowd-signal logic used in production:
      - More unique reporters          → stronger signal
      - Reporters physically near stop → stronger signal
      - High reporter accuracy         → stronger signal
      - Reports clustered in time      → stronger signal
      - Long time since last report    → weaker signal (stale)
      - rush hour / weather can shift base probabilities
  • Noise is injected to prevent the model from over-fitting to perfect rules.
  • All bus_id, stop_id, route_id values mirror seed.js exactly.
  • Sri-Lankan climate (monsoon, no snow, tropical temps).

Output: data/arrivals/arrivals.csv  (~120 k rows by default)
"""

import os, sys, math, random
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from scipy.special import expit          # sigmoid  (pip install scipy)

# ── reproducibility ────────────────────────────────────────────────────────────
SEED = 42
random.seed(SEED)
np.random.seed(SEED)

# ── output ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR  = os.path.join(SCRIPT_DIR, "data", "arrivals")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "arrivals.csv")
NUM_ROWS    = 120_000

# ══════════════════════════════════════════════════════════════════════════════
#  STATIC REFERENCE  (mirrors seed.js exactly)
# ══════════════════════════════════════════════════════════════════════════════

STOPS = [
    # Route 1 – Colombo → Kandy
    {"id":1,  "route":1,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1,"road":"city"},
    {"id":2,  "route":1,"name":"Kelaniya",     "lat":6.9553,"lon":79.9217,"seq":2,"road":"city"},
    {"id":3,  "route":1,"name":"Kadawatha",    "lat":7.0013,"lon":79.9530,"seq":3,"road":"main"},
    {"id":4,  "route":1,"name":"Nittambuwa",   "lat":7.1442,"lon":80.0953,"seq":4,"road":"main"},
    {"id":5,  "route":1,"name":"Kegalle",      "lat":7.2530,"lon":80.3464,"seq":5,"road":"main"},
    {"id":6,  "route":1,"name":"Mawanella",    "lat":7.2425,"lon":80.4440,"seq":6,"road":"mountain"},
    {"id":7,  "route":1,"name":"Kadugannawa",  "lat":7.2547,"lon":80.5243,"seq":7,"road":"mountain"},
    {"id":8,  "route":1,"name":"Peradeniya",   "lat":7.2690,"lon":80.5942,"seq":8,"road":"mountain"},
    {"id":9,  "route":1,"name":"Kandy",        "lat":7.2906,"lon":80.6337,"seq":9,"road":"city"},
    # Route 2 – Colombo → Galle
    {"id":10, "route":2,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1,"road":"city"},
    {"id":11, "route":2,"name":"Dehiwala",     "lat":6.8528,"lon":79.8636,"seq":2,"road":"city"},
    {"id":12, "route":2,"name":"Moratuwa",     "lat":6.7730,"lon":79.8816,"seq":3,"road":"main"},
    {"id":13, "route":2,"name":"Panadura",     "lat":6.7136,"lon":79.9044,"seq":4,"road":"main"},
    {"id":14, "route":2,"name":"Kalutara",     "lat":6.5854,"lon":79.9607,"seq":5,"road":"main"},
    {"id":15, "route":2,"name":"Bentota",      "lat":6.4210,"lon":80.0004,"seq":6,"road":"highway"},
    {"id":16, "route":2,"name":"Ambalangoda",  "lat":6.2352,"lon":80.0540,"seq":7,"road":"highway"},
    {"id":17, "route":2,"name":"Hikkaduwa",    "lat":6.1390,"lon":80.1010,"seq":8,"road":"main"},
    {"id":18, "route":2,"name":"Galle",        "lat":6.0535,"lon":80.2210,"seq":9,"road":"city"},
    # Route 3 – Colombo → Jaffna
    {"id":19, "route":3,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1,"road":"city"},
    {"id":20, "route":3,"name":"Kurunegala",   "lat":7.4863,"lon":80.3647,"seq":2,"road":"main"},
    {"id":21, "route":3,"name":"Dambulla",     "lat":7.8742,"lon":80.6511,"seq":3,"road":"main"},
    {"id":22, "route":3,"name":"Anuradhapura", "lat":8.3114,"lon":80.4037,"seq":4,"road":"main"},
    {"id":23, "route":3,"name":"Vavuniya",     "lat":8.7514,"lon":80.4997,"seq":5,"road":"main"},
    {"id":24, "route":3,"name":"Kilinochchi",  "lat":9.3803,"lon":80.4036,"seq":6,"road":"main"},
    {"id":25, "route":3,"name":"Elephant Pass","lat":9.5697,"lon":80.3800,"seq":7,"road":"main"},
    {"id":26, "route":3,"name":"Jaffna",       "lat":9.6615,"lon":80.0255,"seq":8,"road":"city"},
    # Route 4 – Colombo → Matara
    {"id":27, "route":4,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1,"road":"city"},
    {"id":28, "route":4,"name":"Mount Lavinia","lat":6.8391,"lon":79.8656,"seq":2,"road":"city"},
    {"id":29, "route":4,"name":"Moratuwa",     "lat":6.7730,"lon":79.8816,"seq":3,"road":"main"},
    {"id":30, "route":4,"name":"Panadura",     "lat":6.7136,"lon":79.9044,"seq":4,"road":"main"},
    {"id":31, "route":4,"name":"Kalutara",     "lat":6.5854,"lon":79.9607,"seq":5,"road":"main"},
    {"id":32, "route":4,"name":"Aluthgama",    "lat":6.4342,"lon":80.0024,"seq":6,"road":"main"},
    {"id":33, "route":4,"name":"Ambalangoda",  "lat":6.2352,"lon":80.0540,"seq":7,"road":"main"},
    {"id":34, "route":4,"name":"Galle",        "lat":6.0535,"lon":80.2210,"seq":8,"road":"city"},
    {"id":35, "route":4,"name":"Weligama",     "lat":5.9741,"lon":80.4296,"seq":9,"road":"main"},
    {"id":36, "route":4,"name":"Matara",       "lat":5.9549,"lon":80.5550,"seq":10,"road":"city"},
    # Route 5 – Kandy → Nuwara Eliya
    {"id":37, "route":5,"name":"Kandy",        "lat":7.2906,"lon":80.6337,"seq":1,"road":"city"},
    {"id":38, "route":5,"name":"Gampola",      "lat":7.1642,"lon":80.5767,"seq":2,"road":"mountain"},
    {"id":39, "route":5,"name":"Nawalapitiya", "lat":7.0489,"lon":80.5345,"seq":3,"road":"mountain"},
    {"id":40, "route":5,"name":"Nuwara Eliya", "lat":6.9497,"lon":80.7891,"seq":4,"road":"mountain"},
]

BUSES = [{"id": r*2-1, "route": r} for r in range(1, 6)] + \
        [{"id": r*2,   "route": r} for r in range(1, 6)]
BUSES.sort(key=lambda b: b["id"])

STOP_MAP = {s["id"]: s for s in STOPS}
STOPS_BY_ROUTE = {}
for s in STOPS:
    STOPS_BY_ROUTE.setdefault(s["route"], []).append(s)
for v in STOPS_BY_ROUTE.values():
    v.sort(key=lambda s: s["seq"])

# Monthly rain probability (Sri Lanka, 0-indexed)
MONTHLY_RAIN_PROB = [0.30,0.15,0.12,0.22,0.40,0.58,0.65,0.60,0.48,0.44,0.42,0.35]

# Events: (month, day, stop_name) → crowds increase false-positive risk slightly
EVENT_LOOKUP = {
    (7,5,"Kandy"): True, (7,6,"Kandy"): True, (7,7,"Kandy"): True,
    (7,8,"Kandy"): True, (7,9,"Kandy"): True,
    (3,13,"Colombo Fort"): True, (3,14,"Colombo Fort"): True,
    (0,15,"Colombo Fort"): True, (10,5,"Jaffna"): True,
    (11,25,"Colombo Fort"): True, (0,20,"Galle"): True,
    (8,18,"Nuwara Eliya"): True, (5,3,"Anuradhapura"): True,
    (5,4,"Anuradhapura"): True,
}

# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def draw_weather(month):
    rp = MONTHLY_RAIN_PROB[month]
    r  = random.random()
    if r < rp * 0.10: return "thunderstorm"
    if r < rp * 0.25: return "heavy_rain"
    if r < rp:        return "rain"
    if r < rp + 0.08: return "fog"
    if r < rp + 0.22: return "cloudy"
    return "clear"

def weather_numeric(wc):
    """Returns (rain_mm, visibility_m, wind_m/s, humidity_pct, temp_C, delay_mult)."""
    rain   = {"thunderstorm":12.0,"heavy_rain":8.0,"rain":3.5}.get(wc, 0.0)
    rain  += random.uniform(-0.3, 0.3)
    vis    = {"thunderstorm":2000,"heavy_rain":3500,"rain":6000,
              "fog":1500,"cloudy":8000,"clear":10000}[wc]
    vis   += random.uniform(-200, 200)
    wind   = {"thunderstorm": random.uniform(8,18), "heavy_rain": random.uniform(4,10),
              "rain": random.uniform(2,7),  "fog": random.uniform(0,3),
              "cloudy": random.uniform(1,5),"clear": random.uniform(0,4)}[wc]
    humid  = {"thunderstorm": random.uniform(88,100),"heavy_rain": random.uniform(82,97),
              "rain": random.uniform(75,92),          "fog": random.uniform(80,95),
              "cloudy": random.uniform(60,80),        "clear": random.uniform(45,70)}[wc]
    temp   = random.uniform(20, 27) if wc in ("thunderstorm","heavy_rain") \
             else random.uniform(24, 32)
    mult   = {"thunderstorm":2.2,"heavy_rain":1.7,"rain":1.3,
              "fog":1.25,"cloudy":1.05,"clear":1.0}[wc]
    return max(0, rain), max(0, vis), max(0, wind), min(100, humid), temp, mult

def weather_onehot(wc):
    oh = {f"weather_{c}": 0
          for c in ["clear","rain","snow","fog","clouds","thunderstorm","unknown"]}
    if wc in ("rain","heavy_rain"): oh["weather_rain"] = 1
    elif wc == "thunderstorm":      oh["weather_thunderstorm"] = 1
    elif wc == "fog":               oh["weather_fog"] = 1
    elif wc == "cloudy":            oh["weather_clouds"] = 1
    else:                           oh["weather_clear"] = 1
    return oh

def time_features(hour, dow_js):
    return {
        "hour_of_day":     hour,
        "day_of_week":     dow_js,
        "is_weekend":      int(dow_js in (0, 6)),
        "is_rush_hour":    int((7 <= hour <= 10) or (17 <= hour <= 20)),
        "is_early_morning":int(5 <= hour <= 8),
        "is_mid_day":      int(9 <= hour <= 16),
        "is_evening":      int(17 <= hour <= 20),
        "is_night":        int(hour >= 21 or hour <= 4),
    }

def traffic_level_int(is_rush, wc):
    if is_rush and wc in ("thunderstorm","heavy_rain"): return 3
    if is_rush:                                         return random.choice([2, 3])
    if wc in ("thunderstorm","heavy_rain"):             return 2
    return random.choices([1, 2], weights=[0.6, 0.4])[0]

# ─────────────────────────────────────────────────────────────────────────────
#  CONFIRM_PROB SIGNAL MODEL
#
#  Uses a logistic function over a composite "evidence score" so the output
#  is bounded [0, 1] and naturally shaped.
#
#  Positive contributors  (bus really is there):
#    + unique_reporters         more people → stronger
#    + pct_within_radius        physically close → stronger
#    + acc_mean                 high accuracy users → stronger
#    + 1/t_std                  tight time cluster → stronger
#    + 1/distance_mean          close to stop → stronger
#    + 1/time_since_last_report fresh reports → stronger
#    + is_rush_hour             buses actually run; more real events
#
#  Negative contributors  (report may be spurious):
#    - time_since_first_report  long window → could be spread/confused
#    - distance_mean            far reporters → uncertain location
#    - t_std                    scattered timestamps → noise
#    - event_nearby             crowds produce phantom reports
#    - bad weather              reduces reporter reliability slightly
# ─────────────────────────────────────────────────────────────────────────────

def compute_confirm_prob(
    report_count, unique_reporters, reports_per_minute,
    time_since_last_report_s, time_since_first_report_s,
    distance_mean, distance_median, distance_std,
    pct_within_radius, weighted_dist_mean,
    acc_mean, t_std, hour, is_rush, is_weekend,
    traffic_level, event_nearby, wc,
    road_type
):
    # ── evidence score components (all contribute to a logit) ──────────────
    score = 0.0

    # 1. Reporter count – log-scaled, diminishing returns
    score += 1.8 * math.log1p(unique_reporters)

    # 2. Proximity – reporters physically at the stop
    score += 3.5 * pct_within_radius
    if distance_mean and distance_mean > 0:
        score -= 0.008 * min(distance_mean, 500)   # penalise far reporters

    # 3. Temporal clustering – tight = same event
    if t_std < 5:
        score += 2.0
    elif t_std < 15:
        score += 1.2
    elif t_std > 60:
        score -= 1.0
    elif t_std > 120:
        score -= 2.0

    # 4. Reporter accuracy
    score += 2.5 * acc_mean

    # 5. Freshness of reports
    if time_since_last_report_s < 15:
        score += 1.5
    elif time_since_last_report_s < 60:
        score += 0.7
    elif time_since_last_report_s > 300:
        score -= 1.2

    # 6. Report window – long window = lower confidence
    if time_since_first_report_s > 180:
        score -= 1.0
    elif time_since_first_report_s > 90:
        score -= 0.4

    # 7. Rush-hour bonus: buses are running, more real arrivals
    if is_rush:
        score += 0.8

    # 8. Night penalty: fewer real buses, phantom reports more likely
    if hour >= 22 or hour <= 4:
        score -= 1.5
    elif hour <= 5:
        score -= 0.5

    # 9. Event nearby: crowd noise slightly hurts confidence
    if event_nearby:
        score -= 0.6

    # 10. Weather: heavy rain makes reporters stay inside →
    #     if reports still come in, they're probably real (small boost)
    #     but thunderstorms create confusion (slight penalty)
    if wc == "thunderstorm":
        score -= 0.4
    elif wc in ("rain", "heavy_rain"):
        score += 0.3   # if someone reported in rain, likely genuine

    # 11. Mountain/city stops have lower baseline volume → single report weaker
    if road_type == "mountain" and unique_reporters < 2:
        score -= 0.8

    # 12. High traffic → buses are actually moving; slight boost
    if traffic_level >= 2:
        score += 0.3

    # ── logistic transform → probability ──────────────────────────────────
    # Centre the logit so median scenario → ~0.65
    logit = score - 3.5
    prob  = float(expit(logit))

    # ── inject calibrated noise ────────────────────────────────────────────
    #  small Gaussian jitter so the model can't just learn the exact formula
    noise = np.random.normal(0, 0.05)
    prob  = float(np.clip(prob + noise, 0.01, 0.99))

    return round(prob, 4)


# ══════════════════════════════════════════════════════════════════════════════
#  ROW GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

def generate_row(bus, stop, month, day_of_month, dow_js, hour, wc, base_ms, prev_arrival_ms):
    road = stop["road"]

    # ── crowd signal realism ──────────────────────────────────────────────
    is_rush    = int((7 <= hour <= 10) or (17 <= hour <= 20))
    is_night   = int(hour >= 22 or hour <= 4)
    is_event   = int(EVENT_LOOKUP.get((month, day_of_month, stop["name"]), False))

    # Base reporter count varies by road type and time
    base_rep = {"city": 5, "main": 3, "highway": 2, "mountain": 1}[road]
    if is_rush:    base_rep += 3
    if is_night:   base_rep  = max(1, base_rep - 2)
    if is_event:   base_rep += 4

    # Two scenarios: real arrival (75%) vs phantom/false report (25%)
    is_real_arrival = random.random() < 0.75

    if is_real_arrival:
        # Real: more reporters, closer, tighter cluster
        report_count     = max(1, int(np.random.poisson(base_rep)))
        unique_reporters = max(1, min(report_count, int(np.random.poisson(base_rep * 0.85))))
        t_std            = random.uniform(2, 30)
        d_mean           = random.uniform(5, 60)
        pct_within       = random.uniform(0.55, 1.0)
        acc_mean_v       = random.uniform(0.65, 0.98)
        time_since_last  = random.uniform(2, 45)
        time_since_first = random.uniform(5, 90)
    else:
        # Phantom: fewer, farther, scattered
        report_count     = max(1, int(np.random.poisson(max(1, base_rep * 0.4))))
        unique_reporters = max(1, min(report_count, int(np.random.poisson(max(1, base_rep * 0.3)))))
        t_std            = random.uniform(30, 200)
        d_mean           = random.uniform(60, 400)
        pct_within       = random.uniform(0.05, 0.45)
        acc_mean_v       = random.uniform(0.30, 0.70)
        time_since_last  = random.uniform(30, 600)
        time_since_first = random.uniform(60, 600)

    spread_s    = time_since_first
    rpm         = round(report_count / max(1, spread_s / 60), 3)
    d_median    = d_mean * random.uniform(0.6, 1.0)
    d_std       = d_mean * random.uniform(0.2, 0.5)
    w_dist_mean = d_mean * random.uniform(0.85, 1.0)

    # ── timestamps ────────────────────────────────────────────────────────
    sched_mins  = stop["seq"] * 18
    sched_h     = hour + sched_mins // 60
    sched_m     = sched_mins % 60
    arr_ms      = base_ms + (sched_h * 3600 + sched_m * 60 + random.randint(-300, 600)) * 1000
    t_mean_v    = arr_ms / 1000 - random.uniform(0, spread_s)

    # ── weather numerics ──────────────────────────────────────────────────
    rain_mm, vis_m, wind_ms, humid_pct, temp_c, w_mult = weather_numeric(wc)
    tl_int = traffic_level_int(is_rush, wc)

    # ── target ────────────────────────────────────────────────────────────
    confirm_prob = compute_confirm_prob(
        report_count, unique_reporters, rpm,
        time_since_last, time_since_first,
        d_mean, d_median, d_std, pct_within, w_dist_mean,
        acc_mean_v, t_std, sched_h % 24, is_rush, int(dow_js in (0,6)),
        tl_int, is_event, wc, road
    )

    tf = time_features(sched_h % 24, dow_js)
    oh = weather_onehot(wc)

    return {
        # identifiers
        "bus_id":    bus["id"],
        "stop_id":   stop["id"],
        "route_id":  bus["route"],
        "trip_id":   0,
        "arrival_time": round(arr_ms, 0),

        # crowd signal
        "report_count":              report_count,
        "unique_reporters":          unique_reporters,
        "reports_per_minute":        rpm,
        "time_since_last_report_s":  round(time_since_last, 2),
        "time_since_first_report_s": round(time_since_first, 2),

        # distance
        "distance_mean":     round(d_mean, 2),
        "distance_median":   round(d_median, 2),
        "distance_std":      round(d_std, 2),
        "pct_within_radius": round(pct_within, 3),
        "weighted_dist_mean":round(w_dist_mean, 2),

        # accuracy
        "acc_mean": round(acc_mean_v, 3),

        # previous arrival
        "prev_arrival_time":         round(prev_arrival_ms, 0) if prev_arrival_ms else 0.0,
        "time_since_last_arrival_s": round((arr_ms - prev_arrival_ms) / 1000, 1)
                                     if prev_arrival_ms else 0.0,

        # timestamp stats
        "t_mean": round(t_mean_v, 3),
        "t_std":  round(t_std, 3),

        # time features
        **tf,

        # weather
        "rain_1h":   round(rain_mm, 2),
        "snow_1h":   0.0,
        "temperature": round(temp_c, 1),
        "wind_speed":  round(wind_ms, 1),
        "humidity":    round(humid_pct, 1),
        "visibility":  round(vis_m, 0),
        "weather_delay_multiplier": round(w_mult, 3),
        **oh,

        # context
        "traffic_level": tl_int,
        "event_nearby":  is_event,

        # ── TARGET ────────────────────────────────────────────────────────
        "confirm_prob": confirm_prob,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN GENERATION LOOP
# ══════════════════════════════════════════════════════════════════════════════

WEEKDAY_HOURS = list(range(5, 23))           # every hour 05:00–22:00
WEEKEND_HOURS = [6,8,10,12,14,16,18,20]      # sparser service

def generate(n_rows=NUM_ROWS, output_path=OUTPUT_FILE):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    BASE_DATE = datetime(2024, 7, 1, tzinfo=timezone.utc)
    all_rows  = []
    day       = 0
    prev_arr  = {}   # (bus_id, stop_id) → last arrival_ms

    print(f"Generating ≈{n_rows:,} rows …")

    while len(all_rows) < n_rows:
        date       = BASE_DATE + timedelta(days=day % 365)
        month      = date.month - 1
        dom        = date.day
        dow_py     = date.weekday()
        dow_js     = (dow_py + 1) % 7        # Sun=0
        is_weekend = dow_py >= 5
        base_ms    = int(date.timestamp() * 1000)
        hours      = WEEKEND_HOURS if is_weekend else WEEKDAY_HOURS
        wc         = draw_weather(month)

        for bus in BUSES:
            route_stops = STOPS_BY_ROUTE[bus["route"]]
            for hour in hours:
                for stop in route_stops:
                    key            = (bus["id"], stop["id"])
                    prev_arr_ms    = prev_arr.get(key)
                    row            = generate_row(bus, stop, month, dom, dow_js,
                                                  hour, wc, base_ms, prev_arr_ms)
                    prev_arr[key]  = row["arrival_time"]
                    all_rows.append(row)

        day += 1
        if day % 10 == 0:
            pct = min(100, len(all_rows) * 100 // n_rows)
            print(f"  day {day:3d} | rows {len(all_rows):8,} ({pct}%)")

    all_rows = all_rows[:n_rows]
    df = pd.DataFrame(all_rows)

    # ── dtype cleanup ─────────────────────────────────────────────────────
    int_cols = [
        "bus_id","stop_id","route_id","trip_id",
        "report_count","unique_reporters",
        "hour_of_day","day_of_week",
        "is_weekend","is_rush_hour","is_early_morning","is_mid_day",
        "is_evening","is_night",
        "weather_clear","weather_rain","weather_snow","weather_fog",
        "weather_clouds","weather_thunderstorm","weather_unknown",
        "traffic_level","event_nearby",
    ]
    for c in int_cols:
        if c in df.columns:
            df[c] = df[c].fillna(0).astype(int)

    df.to_csv(output_path, index=False)

    # ── summary ───────────────────────────────────────────────────────────
    print(f"\n✓ Saved {len(df):,} rows → {output_path}")
    print(f"\nFeature summary:")
    print(f"  Columns  : {len(df.columns)}")
    print(f"  Routes   : {df['route_id'].nunique()}  Buses: {df['bus_id'].nunique()}  "
          f"Stops: {df['stop_id'].nunique()}")

    print(f"\nTarget — confirm_prob:")
    print(df["confirm_prob"].describe().round(3).to_string())

    print(f"\nDistribution buckets:")
    bins  = [0, 0.2, 0.4, 0.6, 0.8, 1.01]
    labels= ["0.0–0.2","0.2–0.4","0.4–0.6","0.6–0.8","0.8–1.0"]
    df["_bucket"] = pd.cut(df["confirm_prob"], bins=bins, labels=labels, right=False)
    for label, cnt in df["_bucket"].value_counts().sort_index().items():
        bar = "█" * int(cnt / len(df) * 40)
        print(f"  {label}  {cnt:>7,} ({cnt/len(df)*100:4.1f}%)  {bar}")
    df.drop(columns=["_bucket"], inplace=True)

    print(f"\nMean confirm_prob by scenario:")
    print(f"  Rush hour  : {df[df.is_rush_hour==1]['confirm_prob'].mean():.3f}")
    print(f"  Off-peak   : {df[df.is_rush_hour==0]['confirm_prob'].mean():.3f}")
    print(f"  Night      : {df[df.is_night==1]['confirm_prob'].mean():.3f}")
    print(f"  Event nearby: {df[df.event_nearby==1]['confirm_prob'].mean():.3f}")
    print(f"  High traffic: {df[df.traffic_level==3]['confirm_prob'].mean():.3f}")
    print(f"  Rain        : {df[df.weather_rain==1]['confirm_prob'].mean():.3f}")

    return df


if __name__ == "__main__":
    df = generate()
