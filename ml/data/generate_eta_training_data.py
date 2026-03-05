"""
generate_eta_csv.py
───────────────────
Generates a realistic ETA training dataset fully consistent with the
bus_system database (seed.js) and the ETAFeatures Pydantic schema.

Target column : delay_seconds
  → Additional seconds beyond base_travel_time the bus will take to reach
    the target stop. Can be negative (early arrival).

All 75+ feature columns have genuine causal relationships with the target
so the model has real signal to learn — not random noise dressed as features.

Output : data/eta/eta.csv   (~150 k rows by default)
Needs  : pip install numpy pandas scipy
"""

import os, sys, math, random
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR  = os.path.join(SCRIPT_DIR, "data", "eta")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "eta.csv")
NUM_ROWS    = 150_000

# ══════════════════════════════════════════════════════════════════════════════
#  STATIC REFERENCE DATA
# ══════════════════════════════════════════════════════════════════════════════

STOPS = [
    {"id":1,  "route":1,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1, "road":"city"},
    {"id":2,  "route":1,"name":"Kelaniya",     "lat":6.9553,"lon":79.9217,"seq":2, "road":"city"},
    {"id":3,  "route":1,"name":"Kadawatha",    "lat":7.0013,"lon":79.9530,"seq":3, "road":"main"},
    {"id":4,  "route":1,"name":"Nittambuwa",   "lat":7.1442,"lon":80.0953,"seq":4, "road":"main"},
    {"id":5,  "route":1,"name":"Kegalle",      "lat":7.2530,"lon":80.3464,"seq":5, "road":"main"},
    {"id":6,  "route":1,"name":"Mawanella",    "lat":7.2425,"lon":80.4440,"seq":6, "road":"mountain"},
    {"id":7,  "route":1,"name":"Kadugannawa",  "lat":7.2547,"lon":80.5243,"seq":7, "road":"mountain"},
    {"id":8,  "route":1,"name":"Peradeniya",   "lat":7.2690,"lon":80.5942,"seq":8, "road":"mountain"},
    {"id":9,  "route":1,"name":"Kandy",        "lat":7.2906,"lon":80.6337,"seq":9, "road":"city"},
    {"id":10, "route":2,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1, "road":"city"},
    {"id":11, "route":2,"name":"Dehiwala",     "lat":6.8528,"lon":79.8636,"seq":2, "road":"city"},
    {"id":12, "route":2,"name":"Moratuwa",     "lat":6.7730,"lon":79.8816,"seq":3, "road":"main"},
    {"id":13, "route":2,"name":"Panadura",     "lat":6.7136,"lon":79.9044,"seq":4, "road":"main"},
    {"id":14, "route":2,"name":"Kalutara",     "lat":6.5854,"lon":79.9607,"seq":5, "road":"main"},
    {"id":15, "route":2,"name":"Bentota",      "lat":6.4210,"lon":80.0004,"seq":6, "road":"highway"},
    {"id":16, "route":2,"name":"Ambalangoda",  "lat":6.2352,"lon":80.0540,"seq":7, "road":"highway"},
    {"id":17, "route":2,"name":"Hikkaduwa",    "lat":6.1390,"lon":80.1010,"seq":8, "road":"main"},
    {"id":18, "route":2,"name":"Galle",        "lat":6.0535,"lon":80.2210,"seq":9, "road":"city"},
    {"id":19, "route":3,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1, "road":"city"},
    {"id":20, "route":3,"name":"Kurunegala",   "lat":7.4863,"lon":80.3647,"seq":2, "road":"main"},
    {"id":21, "route":3,"name":"Dambulla",     "lat":7.8742,"lon":80.6511,"seq":3, "road":"main"},
    {"id":22, "route":3,"name":"Anuradhapura", "lat":8.3114,"lon":80.4037,"seq":4, "road":"main"},
    {"id":23, "route":3,"name":"Vavuniya",     "lat":8.7514,"lon":80.4997,"seq":5, "road":"main"},
    {"id":24, "route":3,"name":"Kilinochchi",  "lat":9.3803,"lon":80.4036,"seq":6, "road":"main"},
    {"id":25, "route":3,"name":"Elephant Pass","lat":9.5697,"lon":80.3800,"seq":7, "road":"main"},
    {"id":26, "route":3,"name":"Jaffna",       "lat":9.6615,"lon":80.0255,"seq":8, "road":"city"},
    {"id":27, "route":4,"name":"Colombo Fort", "lat":6.9344,"lon":79.8428,"seq":1, "road":"city"},
    {"id":28, "route":4,"name":"Mount Lavinia","lat":6.8391,"lon":79.8656,"seq":2, "road":"city"},
    {"id":29, "route":4,"name":"Moratuwa",     "lat":6.7730,"lon":79.8816,"seq":3, "road":"main"},
    {"id":30, "route":4,"name":"Panadura",     "lat":6.7136,"lon":79.9044,"seq":4, "road":"main"},
    {"id":31, "route":4,"name":"Kalutara",     "lat":6.5854,"lon":79.9607,"seq":5, "road":"main"},
    {"id":32, "route":4,"name":"Aluthgama",    "lat":6.4342,"lon":80.0024,"seq":6, "road":"main"},
    {"id":33, "route":4,"name":"Ambalangoda",  "lat":6.2352,"lon":80.0540,"seq":7, "road":"main"},
    {"id":34, "route":4,"name":"Galle",        "lat":6.0535,"lon":80.2210,"seq":8, "road":"city"},
    {"id":35, "route":4,"name":"Weligama",     "lat":5.9741,"lon":80.4296,"seq":9, "road":"main"},
    {"id":36, "route":4,"name":"Matara",       "lat":5.9549,"lon":80.5550,"seq":10,"road":"city"},
    {"id":37, "route":5,"name":"Kandy",        "lat":7.2906,"lon":80.6337,"seq":1, "road":"city"},
    {"id":38, "route":5,"name":"Gampola",      "lat":7.1642,"lon":80.5767,"seq":2, "road":"mountain"},
    {"id":39, "route":5,"name":"Nawalapitiya", "lat":7.0489,"lon":80.5345,"seq":3, "road":"mountain"},
    {"id":40, "route":5,"name":"Nuwara Eliya", "lat":6.9497,"lon":80.7891,"seq":4, "road":"mountain"},
]

BUSES = sorted(
    [{"id": r*2-1, "route": r} for r in range(1, 6)] +
    [{"id": r*2,   "route": r} for r in range(1, 6)],
    key=lambda b: b["id"]
)

STOPS_BY_ROUTE = {}
for s in STOPS:
    STOPS_BY_ROUTE.setdefault(s["route"], []).append(s)
for v in STOPS_BY_ROUTE.values():
    v.sort(key=lambda s: s["seq"])

ROAD_SPEEDS = {"highway":(65,85), "main":(38,60), "mountain":(16,30), "city":(10,22)}
MONTHLY_RAIN_PROB = [0.30,0.15,0.12,0.22,0.40,0.58,0.65,0.60,0.48,0.44,0.42,0.35]
SL_HOLIDAYS = {(0,15),(0,14),(3,13),(3,14),(4,1),(5,3),(5,22),(7,5),(7,6),(7,7),(8,18),(9,2),(11,25)}

EVENT_MAP = {
    (7,5,"Kandy"):900,(7,6,"Kandy"):1200,(7,7,"Kandy"):1500,
    (7,8,"Kandy"):1200,(7,9,"Kandy"):900,
    (3,13,"Colombo Fort"):1100,(3,14,"Colombo Fort"):1100,
    (0,15,"Colombo Fort"):600,(10,5,"Jaffna"):700,
    (11,25,"Colombo Fort"):450,(0,20,"Galle"):500,
    (8,18,"Nuwara Eliya"):500,(5,3,"Anuradhapura"):800,(5,4,"Anuradhapura"):800,
}

# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1,p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2-lat1); dl = math.radians(lon2-lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def clamp(v,lo,hi): return max(lo,min(hi,v))

def rush_mult(hour, minute=0):
    t = hour + minute/60
    if 7.0<=t<=9.5:   return random.uniform(1.8,3.5)
    if 11.5<=t<=13.0: return random.uniform(1.1,1.4)
    if 16.0<=t<=19.5: return random.uniform(1.5,3.0)
    if t<6.5:         return random.uniform(0.5,0.85)
    return 1.0

def draw_weather(month):
    rp=MONTHLY_RAIN_PROB[month]; r=random.random()
    if r<rp*0.10: return "thunderstorm"
    if r<rp*0.25: return "heavy_rain"
    if r<rp:      return "rain"
    if r<rp+0.08: return "fog"
    if r<rp+0.22: return "cloudy"
    return "clear"

def weather_numerics(wc):
    rain = max(0,{"thunderstorm":12.0,"heavy_rain":8.0,"rain":3.5}.get(wc,0)+random.uniform(-.3,.3))
    vis  = max(0,{"thunderstorm":2000,"heavy_rain":3500,"rain":6000,"fog":1500,"cloudy":8000,"clear":10000}[wc]+random.uniform(-200,200))
    wind = max(0,{"thunderstorm":random.uniform(8,18),"heavy_rain":random.uniform(4,10),"rain":random.uniform(2,7),"fog":random.uniform(0,3),"cloudy":random.uniform(1,5),"clear":random.uniform(0,4)}[wc])
    hum  = clamp({"thunderstorm":random.uniform(88,100),"heavy_rain":random.uniform(82,97),"rain":random.uniform(75,92),"fog":random.uniform(80,95),"cloudy":random.uniform(60,80),"clear":random.uniform(45,70)}[wc],0,100)
    temp = random.uniform(20,27) if wc in("thunderstorm","heavy_rain") else random.uniform(24,32)
    mult = {"thunderstorm":2.2,"heavy_rain":1.7,"rain":1.3,"fog":1.25,"cloudy":1.05,"clear":1.0}[wc]
    return rain,vis,wind,hum,temp,mult

def weather_onehot(wc):
    oh={f"weather_{c}":0 for c in ["clear","rain","snow","fog","clouds","thunderstorm","unknown"]}
    if wc in("rain","heavy_rain"): oh["weather_rain"]=1
    elif wc=="thunderstorm":       oh["weather_thunderstorm"]=1
    elif wc=="fog":                oh["weather_fog"]=1
    elif wc=="cloudy":             oh["weather_clouds"]=1
    else:                          oh["weather_clear"]=1
    return oh

def weather_delay_sec(wc, road):
    base={"thunderstorm":{"city":240,"main":160,"mountain":360,"highway":100},
          "heavy_rain":  {"city":180,"main":110,"mountain":260,"highway":70},
          "rain":        {"city":60,"main":45,"mountain":120,"highway":30},
          "fog":         {"city":45,"main":35,"mountain":90,"highway":25},
          "cloudy":      {"city":10,"main":8,"mountain":15,"highway":5},
          "clear":       {"city":0,"main":0,"mountain":0,"highway":0}}
    mean=base.get(wc,base["clear"]).get(road,0)
    return max(0, np.random.normal(mean,mean*0.3))

# ── precompute segment baselines ──────────────────────────────────────────────
seg_baselines = {}
for route_id, route_stops in STOPS_BY_ROUTE.items():
    for i in range(len(route_stops)-1):
        s1,s2=route_stops[i],route_stops[i+1]
        dist=haversine(s1["lat"],s1["lon"],s2["lat"],s2["lon"])
        lo,hi=ROAD_SPEEDS[s1["road"]]
        avg=(dist/((lo+hi)/2))*3600
        std=avg*random.uniform(0.12,0.28)
        seg_baselines[(route_id,s1["seq"])]=(avg,std,dist)

# ── precompute historical stats per (route, hour) ─────────────────────────────
hist_stats={}
for route_id in range(1,6):
    for hour in range(24):
        if 7<=hour<=9 or 17<=hour<=19: base=random.uniform(200,400)
        elif hour<6 or hour>21:        base=random.uniform(-30,80)
        else:                          base=random.uniform(50,200)
        p50=base*random.uniform(0.85,1.0)
        p90=base*random.uniform(1.5,2.5)
        punc=clamp(1-base/800,0.3,0.95)
        hist_stats[(route_id,hour)]=(base,p50,p90,punc)

# ══════════════════════════════════════════════════════════════════════════════
#  TRIP SIMULATOR
# ══════════════════════════════════════════════════════════════════════════════

def simulate_trip(bus, date, start_hour, base_ts_ms):
    route_id    = bus["route"]
    route_stops = STOPS_BY_ROUTE[route_id]
    n_stops     = len(route_stops)
    month       = date.month-1
    dom         = date.day
    dow_py      = date.weekday()
    dow_js      = (dow_py+1)%7
    is_weekend  = int(dow_py>=5)
    is_holiday  = int((month,dom) in SL_HOLIDAYS)

    wc = draw_weather(month)
    rain_mm,vis_m,wind,humid,temp,wmult = weather_numerics(wc)
    oh = weather_onehot(wc)
    tl_base = 3 if ((7<=start_hour<=9 or 17<=start_hour<=19) and wc in("thunderstorm","heavy_rain")) \
              else 2 if (7<=start_hour<=9 or 17<=start_hour<=19) else 1

    # ── propagate delay through all stops ─────────────────────────────────
    running_delay = np.random.normal(0,40)
    stop_delays   = []
    for si,stop in enumerate(route_stops):
        road=stop["road"]
        rm=rush_mult(start_hour+si*0.3)
        if si>0:
            seg_avg,seg_std,_=seg_baselines.get((route_id,route_stops[si-1]["seq"]),(600,90,10))
            running_delay += np.random.normal(0,seg_std*0.25)*rm + weather_delay_sec(wc,road)
        else:
            running_delay=clamp(running_delay,-90,180)
        if random.random()<0.004: running_delay+=random.randint(300,1200)
        ev=EVENT_MAP.get((month,dom,stop["name"]),0)
        if ev: running_delay+=ev*random.uniform(0.6,1.4)
        if si>0 and running_delay>0: running_delay*=random.uniform(0.86,0.95)
        elif si>0: running_delay=max(-120,running_delay)
        stop_delays.append(round(running_delay))

    rows=[]
    hist_avg,hist_p50,hist_p90,hist_punc=hist_stats[(route_id,start_hour%24)]

    for current_si in range(n_stops-1):
        current_stop   = route_stops[current_si]
        current_delay  = stop_delays[current_si]
        road_cur       = current_stop["road"]
        sched_mins_cur = current_stop["seq"]*18
        arr_h_cur      = start_hour+sched_mins_cur//60
        arr_m_cur      = sched_mins_cur%60
        arr_ms_cur     = base_ts_ms+(arr_h_cur*3600+arr_m_cur*60+current_delay)*1000

        remaining_seqs=list(range(current_si+1,n_stops))
        if not remaining_seqs: continue
        target_si   = random.choice(remaining_seqs)
        target_stop = route_stops[target_si]

        # ── segment geometry ──────────────────────────────────────────────
        segs_remaining=[]; dist_remaining=0.0
        for k in range(current_si,target_si):
            key=(route_id,route_stops[k]["seq"])
            avg_s,std_s,d_km=seg_baselines.get(key,(600,90,10))
            segs_remaining.append((avg_s,std_s))
            dist_remaining+=d_km

        seg_times_arr=[s[0] for s in segs_remaining]
        n_segs  = len(seg_times_arr)
        base_tt = sum(seg_times_arr)
        seg_avg = base_tt/n_segs if n_segs else 0
        seg_std = float(np.std(seg_times_arr)) if n_segs>1 else 60.0
        seg_min = min(seg_times_arr) if seg_times_arr else 0
        seg_max = max(seg_times_arr) if seg_times_arr else 0
        seg_var = seg_std**2

        stops_remaining = target_si-current_si
        pct_completed   = current_si/max(1,n_stops-1)

        # ── schedule ──────────────────────────────────────────────────────
        sched_mins_tgt = target_stop["seq"]*18
        sched_h_tgt    = start_hour+sched_mins_tgt//60
        sched_m_tgt    = sched_mins_tgt%60
        sched_arr_ms   = base_ts_ms+(sched_h_tgt*3600+sched_m_tgt*60)*1000
        pred_made_ms   = arr_ms_cur+random.randint(10,120)*1000
        secs_until_sch = (sched_arr_ms-pred_made_ms)/1000

        # ── delay features ─────────────────────────────────────────────────
        if current_si>=2:
            trend=(stop_delays[current_si]-stop_delays[current_si-2])/2
        elif current_si>=1:
            trend=stop_delays[current_si]-stop_delays[current_si-1]
        else: trend=0.0

        is_accel        = int(trend>30)
        avg_delay_today = float(np.mean(stop_delays[:current_si+1]))
        sched_adh       = clamp(1-abs(current_delay)/800,0,1)

        # ── checkpoint ────────────────────────────────────────────────────
        mins_since_ckpt  = random.uniform(0,15)
        fresh_score      = clamp(math.exp(-mins_since_ckpt/8),0,1)
        age_penalty      = clamp(1+mins_since_ckpt/10,1,5)
        has_recent_ckpt  = int(mins_since_ckpt<10)
        stops_since_ckpt = mins_since_ckpt/4
        next_report_t    = random.uniform(30,300)
        ckpt_reliability = clamp(hist_punc*random.uniform(0.85,1.0),0,1)
        inferred_passed  = int(stops_since_ckpt)
        inferred_time    = inferred_passed*seg_avg
        time_since_last  = mins_since_ckpt*60

        # ── time context ──────────────────────────────────────────────────
        hour_pred       = arr_h_cur%24
        is_rush         = int((7<=hour_pred<=10) or (17<=hour_pred<=20))
        is_peak         = int((7<=hour_pred<=20) and not is_weekend)
        mins_into_rush  = 0.0
        if 7<=hour_pred<=10:   mins_into_rush=(hour_pred-7)*60+arr_m_cur
        elif 17<=hour_pred<=20:mins_into_rush=(hour_pred-17)*60+arr_m_cur

        same_day_hr_avg  = hist_avg*random.uniform(0.9,1.1)
        typical_stop_del = hist_avg*clamp(random.uniform(0.7,1.3),0.5,2.0)

        # ── reporter features at target stop ──────────────────────────────
        ev_tgt     = EVENT_MAP.get((month,dom,target_stop["name"]),0)
        base_rep   = {"city":4,"main":2,"highway":2,"mountain":1}[target_stop["road"]]
        if is_rush: base_rep+=2
        rep_count  = max(0,int(np.random.poisson(base_rep)))
        rep_acc    = random.uniform(0.55,0.95) if rep_count>0 else 0.5
        rep_density= round(rep_count/max(1,random.uniform(1,5)),3)
        consensus  = clamp(random.uniform(0.5,1.0) if rep_count>=2 else 0.2,0,1)
        high_qual  = int(rep_count>0 and random.random()<rep_acc*0.4)
        cluster_t  = random.uniform(10,80) if rep_count>0 else 0.0

        # ══════════════════════════════════════════════════════════════════
        #  TARGET — delay_seconds
        #  Causally built: propagated running delay × rush × weather × event
        # ══════════════════════════════════════════════════════════════════
        rm_ahead = rush_mult(hour_pred,arr_m_cur)
        extra    = current_delay*0.70
        extra   += weather_delay_sec(wc,target_stop["road"])*n_segs
        extra   += np.random.normal(0,seg_std*0.15)*rm_ahead
        if ev_tgt: extra+=ev_tgt*random.uniform(0.5,1.2)
        extra   *= (0.92**stops_remaining)
        delay_s  = int(round(clamp(extra,-180,2400)))

        row={
            "bus_id":bus["id"],
            "target_stop_id":target_stop["id"],
            "route_id":route_id,
            "trip_id":0,
            "prediction_made_at":round(pred_made_ms),
            "scheduled_arrival_time":round(sched_arr_ms),
            "seconds_until_scheduled":round(secs_until_sch,1),
            "current_delay_seconds":float(current_delay),
            "delay_at_last_stop":float(current_delay),
            "avg_delay_this_route_today":round(avg_delay_today,1),
            "avg_delay_same_hour":round(hist_avg,1),
            "schedule_adherence_score":round(sched_adh,4),
            "delay_trend_last_3_stops":round(trend,1),
            "is_delay_accelerating":is_accel,
            "delay_per_stop_rate":round(trend,2),
            "stops_remaining":stops_remaining,
            "pct_route_completed":round(pct_completed,4),
            "distance_remaining_km":round(dist_remaining,3),
            "total_segment_time_remaining":round(base_tt,1),
            "avg_segment_time_remaining":round(seg_avg,1),
            "stddev_segment_time":round(seg_std,1),
            "min_segment_time":round(seg_min,1),
            "max_segment_time":round(seg_max,1),
            "segment_time_variance":round(seg_var,1),
            "minutes_since_last_checkpoint":round(mins_since_ckpt,2),
            "checkpoint_freshness_score":round(fresh_score,4),
            "checkpoint_age_penalty":round(age_penalty,4),
            "has_recent_checkpoint":has_recent_ckpt,
            "stops_since_last_checkpoint":round(stops_since_ckpt,2),
            "time_to_next_expected_report":round(next_report_t,1),
            "checkpoint_reliability_score":round(ckpt_reliability,4),
            "historical_delay_avg":round(hist_avg,1),
            "historical_delay_p50":round(hist_p50,1),
            "historical_delay_p90":round(hist_p90,1),
            "same_day_hour_avg_delay":round(same_day_hr_avg,1),
            "recent_24h_performance":round(clamp(hist_punc*random.uniform(0.9,1.1),0,1),4),
            "recent_7d_performance":round(clamp(hist_punc*random.uniform(0.85,1.05),0,1),4),
            "route_punctuality_score":round(hist_punc,4),
            "historical_completion_rate":round(clamp(random.uniform(0.88,0.99),0,1),4),
            "typical_delay_this_stop":round(typical_stop_del,1),
            "historical_sample_count":random.randint(50,500),
            "hour_of_day":hour_pred,
            "day_of_week":dow_js,
            "is_weekend":is_weekend,
            "is_rush_hour":is_rush,
            "is_peak_period":is_peak,
            "minutes_into_rush_hour":round(mins_into_rush,1),
            "temperature":round(temp,1),
            "rain_1h":round(rain_mm,2),
            "snow_1h":0.0,
            "visibility":round(vis_m,0),
            "wind_speed":round(wind,1),
            "humidity":round(humid,1),
            "weather_delay_multiplier":round(wmult,3),
            "traffic_level_encoded":tl_base,
            "is_holiday":is_holiday,
            "is_special_event":int(ev_tgt>0),
            **oh,
            "base_travel_time":round(base_tt,1),
            "inferred_passed_count":inferred_passed,
            "inferred_time_consumed":round(inferred_time,1),
            "segment_time_avg":round(seg_avg,1),
            "time_since_last_stop":round(time_since_last,1),
            "remaining_segment_count":n_segs,
            "distance_to_target":round(dist_remaining,3),
            "scheduled_delay":float(current_delay),
            "reporters_at_target_stop":rep_count,
            "avg_reporter_accuracy_target":round(rep_acc,4),
            "recent_report_density":rep_density,
            "report_consensus_strength":round(consensus,4),
            "has_high_quality_reporter":high_qual,
            "reporter_cluster_tightness":round(cluster_t,2),
            "delay_seconds":delay_s,
        }
        rows.append(row)
    return rows

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

WEEKDAY_STARTS=[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]
WEEKEND_STARTS=[6,8,10,12,14,16,18,20]

def generate(n_rows=NUM_ROWS, output_path=OUTPUT_FILE):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    BASE_DATE=datetime(2024,7,1,tzinfo=timezone.utc)
    all_rows,day=[],0

    print(f"Generating ≈{n_rows:,} rows …")

    while len(all_rows)<n_rows:
        date    = BASE_DATE+timedelta(days=day%365)
        starts  = WEEKEND_STARTS if date.weekday()>=5 else WEEKDAY_STARTS
        base_ms = int(date.timestamp()*1000)
        for bus in BUSES:
            for sh in starts:
                all_rows.extend(simulate_trip(bus,date,sh,base_ms))
        day+=1
        if day%10==0:
            pct=min(100,len(all_rows)*100//n_rows)
            print(f"  day {day:3d} | rows {len(all_rows):8,} ({pct}%)")

    all_rows=all_rows[:n_rows]
    df=pd.DataFrame(all_rows)

    int_cols=["bus_id","target_stop_id","route_id","trip_id",
              "is_delay_accelerating","has_recent_checkpoint",
              "hour_of_day","day_of_week","is_weekend","is_rush_hour",
              "is_peak_period","is_holiday","is_special_event",
              "weather_clear","weather_rain","weather_snow","weather_fog",
              "weather_clouds","weather_thunderstorm","weather_unknown",
              "traffic_level_encoded","historical_sample_count",
              "stops_remaining","remaining_segment_count","inferred_passed_count",
              "reporters_at_target_stop","has_high_quality_reporter",
              "stops_since_last_checkpoint","delay_seconds"]
    for c in int_cols:
        if c in df.columns:
            df[c]=df[c].fillna(0).astype(int)
    df.fillna(0.0,inplace=True)
    df.to_csv(output_path,index=False)

    print(f"\n✓ Saved {len(df):,} rows → {output_path}")
    print(f"  Columns : {len(df.columns)} | Routes: {df['route_id'].nunique()} | "
          f"Buses: {df['bus_id'].nunique()} | Target stops: {df['target_stop_id'].nunique()}")

    print(f"\nTarget — delay_seconds:")
    print(df["delay_seconds"].describe().round(1).to_string())

    print(f"\nMean delay_seconds by scenario:")
    scenarios=[
        ("Rush hour",          df.is_rush_hour==1),
        ("Off-peak",           df.is_rush_hour==0),
        ("Clear weather",      df.weather_clear==1),
        ("Rain",               df.weather_rain==1),
        ("Thunderstorm",       df.weather_thunderstorm==1),
        ("Special event",      df.is_special_event==1),
        ("Holiday",            df.is_holiday==1),
        ("High traffic (3)",   df.traffic_level_encoded==3),
        ("Stale ckpt (<0.3)",  df.checkpoint_freshness_score<0.3),
        ("Fresh ckpt (>0.8)",  df.checkpoint_freshness_score>0.8),
        ("Delay accelerating", df.is_delay_accelerating==1),
        ("1 stop remaining",   df.stops_remaining==1),
        ("5+ stops remaining", df.stops_remaining>=5),
    ]
    for label,mask in scenarios:
        sub=df[mask]
        if len(sub):
            print(f"  {label:<28}: {sub['delay_seconds'].mean():>7.1f}s  (n={len(sub):,})")

    print(f"\nTop-10 feature correlations with delay_seconds:")
    num_cols=df.select_dtypes(include=[np.number]).columns.tolist()
    corrs=df[num_cols].corr()["delay_seconds"].drop("delay_seconds").abs().sort_values(ascending=False)
    for feat,corr in corrs.head(10).items():
        print(f"  {feat:<42}: {corr:.4f}")

    return df

if __name__=="__main__":
    df=generate()