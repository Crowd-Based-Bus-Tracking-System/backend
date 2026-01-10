import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random

# Set random seed for reproducibility
np.random.seed(42)
random.seed(42)

# Configuration based on seeded database
ROUTES = {
    1: {"stops": list(range(1, 8)), "name": "Downtown Express"},
    2: {"stops": list(range(8, 15)), "name": "University Line"},
    3: {"stops": list(range(15, 21)), "name": "Airport Shuttle"}
}

BUSES = {
    1: 1, 2: 1, 3: 1,  # Route 1
    4: 2, 5: 2, 6: 2,  # Route 2
    7: 3, 8: 3, 9: 3, 10: 3  # Route 3
}

# Weather conditions
WEATHER_CONDITIONS = ['Clear', 'Clouds', 'Rain', 'Fog']
TRAFFIC_LEVELS = ['Low', 'Medium', 'High']

def generate_weather_features():
    """Generate realistic weather features"""
    weather = random.choice(WEATHER_CONDITIONS)
    
    rain_1h = np.random.exponential(2) if weather == 'Rain' else 0
    snow_1h = 0  # No snow in tropical climate
    
    if weather == 'Clear':
        temperature = np.random.uniform(25, 35)
        humidity = np.random.uniform(50, 70)
        visibility = 10000
    elif weather == 'Rain':
        temperature = np.random.uniform(22, 28)
        humidity = np.random.uniform(75, 95)
        visibility = np.random.uniform(5000, 9000)
    elif weather == 'Clouds':
        temperature = np.random.uniform(24, 30)
        humidity = np.random.uniform(65, 85)
        visibility = 10000
    else:  # Fog
        temperature = np.random.uniform(20, 26)
        humidity = np.random.uniform(85, 98)
        visibility = np.random.uniform(3000, 7000)
    
    wind_speed = np.random.uniform(1, 10)
    weather_delay_multiplier = 1.0 + (rain_1h / 10) + ((10000 - visibility) / 50000)
    
    return rain_1h, snow_1h, temperature, wind_speed, humidity, visibility, weather_delay_multiplier

def generate_time_features(timestamp):
    """Generate time-based features - handles both seconds and milliseconds"""
    if timestamp > 10000000000:
        timestamp = timestamp / 1000
    
    dt = datetime.fromtimestamp(timestamp)
    hour_of_day = dt.hour
    day_of_week = dt.weekday()
    is_weekend = 1 if day_of_week >= 5 else 0
    is_rush_hour = 1 if (7 <= hour_of_day <= 9) or (17 <= hour_of_day <= 19) else 0
    is_early_morning = 1 if 5 <= hour_of_day < 9 else 0
    is_mid_day = 1 if 9 <= hour_of_day < 17 else 0
    is_evening = 1 if 17 <= hour_of_day < 21 else 0
    is_night = 1 if hour_of_day >= 21 or hour_of_day < 5 else 0
    
    return hour_of_day, day_of_week, is_weekend, is_rush_hour, is_early_morning, is_mid_day, is_evening, is_night

def generate_arrival_features(bus_id, stop_id, arrival_time):
    """Generate features for arrival confirmation"""
    report_count = np.random.randint(1, 25)
    unique_reporters = min(report_count, np.random.randint(1, 20))
    
    # Match production logic: use minimum 5-second span
    span_seconds = max(5, np.random.uniform(5, 600))
    reports_per_minute = report_count / (span_seconds / 60)
    
    time_since_last_report_s = np.random.uniform(5, 300)
    time_since_first_report_s = np.random.uniform(60, 600)
    
    distance_mean = np.random.uniform(10, 500)
    distance_median = distance_mean * np.random.uniform(0.8, 1.2)
    distance_std = distance_mean * np.random.uniform(0.1, 0.4)
    
    pct_within_radius = np.random.uniform(0.3, 1.0)
    acc_mean = np.random.uniform(0.0005, 0.005)
    weighted_dist_mean = distance_mean * np.random.uniform(0.8, 1.2)
    
    prev_arrival_time = arrival_time - np.random.uniform(1800, 7200)
    time_since_last_arrival_s = arrival_time - prev_arrival_time

    t_mean = arrival_time + np.random.uniform(-300, 300)  
    t_std = np.random.uniform(5, 200)  
    
    # Weather and time features
    rain_1h, snow_1h, temperature, wind_speed, humidity, visibility, weather_delay_multiplier = generate_weather_features()
    hour_of_day, day_of_week, is_weekend, is_rush_hour, is_early_morning, is_mid_day, is_evening, is_night = generate_time_features(arrival_time)
    
    # Weather encoded features (8 one-hot encoded fields)
    weather = 'Clear'
    if rain_1h > 0:
        weather = 'Rain'
    elif visibility < 7000:
        weather = 'Fog'
    elif visibility < 9000:
        weather = 'Clouds'
    
    weather_clear = 1 if weather == 'Clear' else 0
    weather_rain = 1 if weather == 'Rain' else 0
    weather_snow = 0  # No snow
    weather_fog = 1 if weather == 'Fog' else 0
    weather_clouds = 1 if weather == 'Clouds' else 0
    weather_thunderstorm = 0
    weather_unknown = 0
    
    # Traffic level
    if is_rush_hour:
        traffic_level = 3  # High
    elif is_mid_day:
        traffic_level = 2  # Medium
    else:
        traffic_level = 1  # Low
    
    event_nearby = np.random.choice([0, 1], p=[0.95, 0.05])  # 5% chance of event
    
    # Confirmation probability
    confirm_prob = min(0.95, max(0.1, 
        (report_count / 25) * 0.3 +
        (unique_reporters / 20) * 0.3 +
        pct_within_radius * 0.2 +
        (1 - min(distance_std / 200, 1)) * 0.2
    ))
    
    return {
        'bus_id': bus_id,
        'stop_id': stop_id,
        'route_id': ((bus_id - 1) // 3) + 1,  # Routes 1-3 based on bus_id
        'trip_id': ((bus_id - 1) % 3) + 1 + (((bus_id - 1) // 3) * 3),  # Trip within route
        'arrival_time': int(arrival_time * 1000),
        'report_count': report_count,
        'unique_reporters': unique_reporters,
        'reports_per_minute': round(reports_per_minute, 2),
        'time_since_last_report_s': round(time_since_last_report_s, 1),
        'time_since_first_report_s': round(time_since_first_report_s, 1),
        'distance_mean': round(distance_mean, 2),
        'distance_median': round(distance_median, 2),
        'distance_std': round(distance_std, 2),
        'pct_within_radius': round(pct_within_radius, 2),
        'acc_mean': round(acc_mean, 6),
        'weighted_dist_mean': round(weighted_dist_mean, 2),
        'prev_arrival_time': round(prev_arrival_time * 1000, 1),
        'time_since_last_arrival_s': round(time_since_last_arrival_s, 1),
        't_mean': round(t_mean * 1000, 2),
        't_std': round(t_std, 2),
        'hour_of_day': hour_of_day,
        'day_of_week': day_of_week,
        'is_weekend': is_weekend,
        'is_rush_hour': is_rush_hour,
        'is_early_morning': is_early_morning,
        'is_mid_day': is_mid_day,
        'is_evening': is_evening,
        'is_night': is_night,
        'rain_1h': round(rain_1h, 1),
        'snow_1h': round(snow_1h, 1),
        'temperature': round(temperature, 2),
        'wind_speed': round(wind_speed, 2),
        'humidity': round(humidity, 2),
        'visibility': round(visibility, 1),
        'weather_delay_multiplier': round(weather_delay_multiplier, 2),
        # Weather encoded fields (ONE-HOT)
        'weather_clear': weather_clear,
        'weather_rain': weather_rain,
        'weather_snow': weather_snow,
        'weather_fog': weather_fog,
        'weather_clouds': weather_clouds,
        'weather_thunderstorm': weather_thunderstorm,
        'weather_unknown': weather_unknown,
        'traffic_level': traffic_level,
        'event_nearby': event_nearby,
        'confirm_prob': round(confirm_prob, 4),
    }

def generate_eta_features(bus_id, target_stop_id, prediction_time, scheduled_time):
    """Generate features for ETA prediction"""
    route_id = BUSES[bus_id]
    route_stops = ROUTES[route_id]["stops"]
    
    # Find current position (somewhere before target)
    target_idx = route_stops.index(target_stop_id)
    current_idx = max(0, target_idx - np.random.randint(1, min(4, target_idx + 1)))
    
    seconds_until_scheduled = scheduled_time - prediction_time
    
    # Delay features
    current_delay_seconds = np.random.randint(-300, 600)
    delay_at_last_stop = current_delay_seconds + np.random.randint(-60, 60)
    avg_delay_this_route_today = np.random.randint(-100, 400)
    avg_delay_same_hour = np.random.randint(-50, 350)
    
    schedule_adherence_score = max(0, min(1, 1 - abs(current_delay_seconds) / 600))
    
    delay_trend_last_3_stops = np.random.randint(-50, 100)
    is_delay_accelerating = 1 if delay_trend_last_3_stops > 20 else 0
    delay_per_stop_rate = abs(current_delay_seconds) / max(1, current_idx + 1)
    
    stops_remaining = target_idx - current_idx
    pct_route_completed = current_idx / len(route_stops)
    distance_remaining_km = stops_remaining * np.random.uniform(0.8, 2.5)
    
    # Segment time features
    avg_segment_time = np.random.uniform(240, 420)
    total_segment_time_remaining = stops_remaining * avg_segment_time
    stddev_segment_time = avg_segment_time * np.random.uniform(0.1, 0.25)
    min_segment_time = avg_segment_time * 0.7
    max_segment_time = avg_segment_time * 1.3
    segment_time_variance = stddev_segment_time ** 2
    
    # Checkpoint features
    minutes_since_last_checkpoint = np.random.uniform(1, 10)
    checkpoint_freshness_score = max(0, 1 - minutes_since_last_checkpoint / 15)
    checkpoint_age_penalty = 1 + (minutes_since_last_checkpoint / 10)  # Must be >= 1
    has_recent_checkpoint = 1 if minutes_since_last_checkpoint < 5 else 0
    stops_since_last_checkpoint = min(stops_remaining, np.random.randint(0, 3))
    time_to_next_expected_report = np.random.uniform(120, 400)
    checkpoint_reliability_score = np.random.uniform(0.6, 0.95)
    
    # Historical features
    historical_delay_avg = np.random.randint(-50, 300)
    historical_delay_p50 = historical_delay_avg + np.random.randint(-30, 30)
    historical_delay_p90 = historical_delay_avg + np.random.randint(50, 150)
    same_day_hour_avg_delay = avg_delay_same_hour + np.random.randint(-20, 20)
    
    recent_24h_performance = np.random.uniform(0.65, 0.95)
    recent_7d_performance = np.random.uniform(0.7, 0.95)
    route_punctuality_score = np.random.uniform(0.75, 0.95)
    historical_completion_rate = np.random.uniform(0.88, 0.98)
    
    typical_delay_this_stop = np.random.randint(-30, 250)
    historical_sample_count = np.random.randint(50, 250)
    
    # Time and weather features
    hour_of_day, day_of_week, is_weekend, is_rush_hour, _, _, _, _ = generate_time_features(prediction_time)
    is_peak_period = is_rush_hour
    minutes_into_rush_hour = np.random.randint(0, 120) if is_rush_hour else 0
    
    rain_1h, snow_1h, temperature, wind_speed, humidity, visibility, weather_delay_multiplier = generate_weather_features()
    
    # Traffic and events
    hour_of_day_val = datetime.fromtimestamp(prediction_time).hour
    if is_rush_hour:
        traffic_level = 'High'
        traffic_level_encoded = 3
    elif 10 <= hour_of_day_val < 16:
        traffic_level = 'Medium'
        traffic_level_encoded = 2
    else:
        traffic_level = 'Low'
        traffic_level_encoded = 1
    
    is_holiday = 0
    is_special_event = 0
    
    # Weather encoded features
    weather_clear = 1 if rain_1h == 0 and visibility >= 9000 else 0
    weather_rain = 1 if rain_1h > 0 else 0
    weather_snow = 0
    weather_fog = 1 if visibility < 7000 and not weather_rain else 0
    weather_clouds = 1 if not (weather_clear or weather_rain or weather_fog) else 0
    weather_thunderstorm = 0
    weather_unknown = 0
    
    # Reporter features
    reporters_at_target_stop = np.random.randint(0, 8)
    avg_reporter_accuracy_target = np.random.uniform(0.7, 0.95) if reporters_at_target_stop > 0 else 0
    recent_report_density = np.random.uniform(0.2, 0.95)
    report_consensus_strength = np.random.uniform(0.65, 0.95)
    has_high_quality_reporter = 1 if avg_reporter_accuracy_target > 0.85 else 0
    reporter_cluster_tightness = np.random.uniform(0.55, 0.9)
    
    # Actual ETA (target variable)
    base_eta = total_segment_time_remaining + current_delay_seconds
    weather_impact = (weather_delay_multiplier - 1) * 300
    traffic_impact = (traffic_level_encoded - 1) * 200
    actual_eta_seconds = int(max(60, base_eta + weather_impact + traffic_impact + np.random.randint(-180, 180)))
    
    return {
        'bus_id': bus_id,
        'target_stop_id': target_stop_id,
        'route_id': ((bus_id - 1) // 3) + 1,  # Routes 1-3 based on bus_id
        'trip_id': ((bus_id - 1) % 3) + 1 + (((bus_id - 1) // 3) * 3),  # Trip within route
        'prediction_made_at': int(prediction_time * 1000),
        'scheduled_arrival_time': int(scheduled_time * 1000),
        'seconds_until_scheduled': seconds_until_scheduled,
        'current_delay_seconds': current_delay_seconds,
        'delay_at_last_stop': delay_at_last_stop,
        'avg_delay_this_route_today': avg_delay_this_route_today,
        'avg_delay_same_hour': avg_delay_same_hour,
        'schedule_adherence_score': round(schedule_adherence_score, 2),
        'delay_trend_last_3_stops': delay_trend_last_3_stops,
        'is_delay_accelerating': is_delay_accelerating,
        'delay_per_stop_rate': round(delay_per_stop_rate, 2),
        'stops_remaining': stops_remaining,
        'pct_route_completed': round(pct_route_completed, 2),
        'distance_remaining_km': round(distance_remaining_km, 2),
        'total_segment_time_remaining': round(total_segment_time_remaining, 0),
        'avg_segment_time_remaining': round(avg_segment_time, 0),
        'stddev_segment_time': round(stddev_segment_time, 0),
        'min_segment_time': round(min_segment_time, 0),
        'max_segment_time': round(max_segment_time, 0),
        'segment_time_variance': round(segment_time_variance, 0),
        'minutes_since_last_checkpoint': round(minutes_since_last_checkpoint, 1),
        'checkpoint_freshness_score': round(checkpoint_freshness_score, 2),
        'checkpoint_age_penalty': round(checkpoint_age_penalty, 2),
        'has_recent_checkpoint': has_recent_checkpoint,
        'stops_since_last_checkpoint': stops_since_last_checkpoint,
        'time_to_next_expected_report': round(time_to_next_expected_report, 0),
        'checkpoint_reliability_score': round(checkpoint_reliability_score, 2),
        'historical_delay_avg': historical_delay_avg,
        'historical_delay_p50': historical_delay_p50,
        'historical_delay_p90': historical_delay_p90,
        'same_day_hour_avg_delay': same_day_hour_avg_delay,
        'recent_24h_performance': round(recent_24h_performance, 2),
        'recent_7d_performance': round(recent_7d_performance, 2),
        'route_punctuality_score': round(route_punctuality_score, 2),
        'historical_completion_rate': round(historical_completion_rate, 2),
        'typical_delay_this_stop': typical_delay_this_stop,
        'historical_sample_count': historical_sample_count,
        'hour_of_day': hour_of_day,
        'day_of_week': day_of_week,
        'is_weekend': is_weekend,
        'is_rush_hour': is_rush_hour,
        'is_peak_period': is_peak_period,
        'minutes_into_rush_hour': minutes_into_rush_hour,
        'temperature': round(temperature, 2),
        'rain_1h': round(rain_1h, 2),
        'snow_1h': round(snow_1h, 2),
        'visibility': round(visibility, 2),
        'wind_speed': round(wind_speed, 2),
        'humidity': round(humidity, 2),
        'weather_delay_multiplier': round(weather_delay_multiplier, 2),
        'traffic_level_encoded': traffic_level_encoded,
        'is_holiday': is_holiday,
        'is_special_event': is_special_event,
        'weather_clear': weather_clear,
        'weather_rain': weather_rain,
        'weather_snow': weather_snow,
        'weather_fog': weather_fog,
        'weather_clouds': weather_clouds,
        'weather_thunderstorm': weather_thunderstorm,
        'weather_unknown': weather_unknown,
        'reporters_at_target_stop': reporters_at_target_stop,
        'avg_reporter_accuracy_target': round(avg_reporter_accuracy_target, 2),
        'recent_report_density': round(recent_report_density, 2),
        'report_consensus_strength': round(report_consensus_strength, 2),
        'has_high_quality_reporter': has_high_quality_reporter,
        'reporter_cluster_tightness': round(reporter_cluster_tightness, 2),
        'actual_eta_seconds': actual_eta_seconds
    }

def generate_arrivals_data(num_samples=500):
    """Generate arrival confirmation training data"""
    print(f"Generating {num_samples} arrival records...")
    
    arrivals = []
    start_date = datetime(2024, 1, 1)
    
    for i in range(num_samples):
        # Random bus and stop
        bus_id = random.choice(list(BUSES.keys()))
        route_id = BUSES[bus_id]
        stop_id = random.choice(ROUTES[route_id]["stops"])
        
        # Random time over 30 days
        days_offset = np.random.uniform(0, 30)
        hour = np.random.randint(6, 23)
        arrival_time = (start_date + timedelta(days=days_offset, hours=hour)).timestamp()
        
        arrival_data = generate_arrival_features(bus_id, stop_id, arrival_time)
        arrivals.append(arrival_data)
    
    return pd.DataFrame(arrivals)

def generate_eta_data(num_samples=500):
    """Generate ETA prediction training data"""
    print(f"Generating {num_samples} ETA records...")
    
    etas = []
    start_date = datetime(2024, 1, 1)
    
    for i in range(num_samples):
        # Random bus and stop
        bus_id = random.choice(list(BUSES.keys()))
        route_id = BUSES[bus_id]
        target_stop_id = random.choice(ROUTES[route_id]["stops"][2:])  # Not first stops
        
        # Random prediction time
        days_offset = np.random.uniform(0, 30)
        hour = np.random.randint(6, 23)
        prediction_time = (start_date + timedelta(days=days_offset, hours=hour)).timestamp()
        
        # Scheduled time (15-60 minutes later)
        scheduled_time = prediction_time + np.random.uniform(900, 3600)
        
        eta_data = generate_eta_features(bus_id, target_stop_id, prediction_time, scheduled_time)
        etas.append(eta_data)
    
    return pd.DataFrame(etas)

if __name__ == "__main__":
    import os
    import shutil
    from datetime import datetime as dt
    
    print("=" * 60)
    print("Generating ML Training Data")
    print("=" * 60)
    
    # Get script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Backup existing files
    timestamp = dt.now().strftime("%Y%m%d_%H%M%S")
    arrivals_path = os.path.join(script_dir, 'arrivals', 'arrivals.csv')
    eta_path = os.path.join(script_dir, 'eta', 'eta.csv')
    
    if os.path.exists(arrivals_path):
        backup_path = os.path.join(script_dir, 'arrivals', f'arrivals_backup_{timestamp}.csv')
        shutil.copy(arrivals_path, backup_path)
        print(f"✓ Backed up existing arrivals to {backup_path}")
    
    if os.path.exists(eta_path):
        backup_path = os.path.join(script_dir, 'eta', f'eta_backup_{timestamp}.csv')
        shutil.copy(eta_path, backup_path)
        print(f"✓ Backed up existing ETA data to {backup_path}")
    
    # Generate fresh data (more samples for better training)
    print("\nGenerating new training data...")
    arrivals_df = generate_arrivals_data(800)
    eta_df = generate_eta_data(800)
    
    # Save fresh CSVs
    arrivals_df.to_csv(arrivals_path, index=False)
    print(f"✓ Saved {len(arrivals_df)} arrivals to {arrivals_path}")
    
    eta_df.to_csv(eta_path, index=False)
    print(f"✓ Saved {len(eta_df)} ETA records to {eta_path}")
    
    print("\n" + "=" * 60)
    print("Training Data Generation Complete!")
    print("=" * 60)
    print(f"\nFinal counts:")
    print(f"  Arrivals: {len(arrivals_df)} records")
    print(f"  ETA:      {len(eta_df)} records")
    print(f"\n💡 Tip: Run the training scripts to build ML models with this data")


