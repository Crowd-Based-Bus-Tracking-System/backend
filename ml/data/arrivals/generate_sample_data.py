import pandas as pd
import numpy as np
from datetime import datetime, timedelta

np.random.seed(42)

# Generate 150 samples for good measure
n_samples = 150

# Generate base features
bus_ids = np.random.randint(1, 11, n_samples)  # 10 different buses
stop_ids = np.random.randint(1, 21, n_samples)  # 20 different stops

# Generate arrival times (timestamps)
base_time = datetime(2024, 1, 1, 6, 0, 0)
arrival_times = [int((base_time + timedelta(minutes=np.random.randint(0, 1440))).timestamp()) for _ in range(n_samples)]

# Report metrics
report_count = np.random.randint(1, 25, n_samples)
unique_reporters = np.array([min(rc, np.random.randint(1, rc + 1)) for rc in report_count])
reports_per_minute = np.round(report_count / np.random.uniform(1, 10, n_samples), 2)
time_since_last_report_s = np.random.randint(5, 300, n_samples)
time_since_first_report_s = np.random.randint(60, 600, n_samples)

# Distance metrics (in meters)
distance_mean = np.round(np.random.uniform(10, 500, n_samples), 2)
distance_median = np.round(distance_mean * np.random.uniform(0.8, 1.2, n_samples), 2)
distance_std = np.round(np.random.uniform(5, 100, n_samples), 2)
pct_within_radius = np.round(np.random.uniform(0.3, 1.0, n_samples), 2)

# Accuracy metrics
acc_mean = np.round(np.random.uniform(5, 50, n_samples), 2)
weighted_dist_mean = np.round(distance_mean * (1 + np.random.uniform(-0.2, 0.2, n_samples)), 2)

# Previous arrival data
prev_arrival_time = arrival_times - np.random.randint(1800, 7200, n_samples)
time_since_last_arrival_s = np.random.randint(1800, 7200, n_samples)

# Time-based statistics
t_mean = np.round(np.random.uniform(300, 1200, n_samples), 2)
t_std = np.round(np.random.uniform(30, 300, n_samples), 2)

# Extract time-based features from arrival_time
hour_of_day = [(datetime.fromtimestamp(t).hour) for t in arrival_times]
day_of_week = [(datetime.fromtimestamp(t).weekday()) for t in arrival_times]
is_weekend = [1 if d >= 5 else 0 for d in day_of_week]

# Time period features
is_rush_hour = [1 if (7 <= h <= 9) or (17 <= h <= 19) else 0 for h in hour_of_day]
is_early_morning = [1 if 5 <= h < 9 else 0 for h in hour_of_day]
is_mid_day = [1 if 9 <= h < 17 else 0 for h in hour_of_day]
is_evening = [1 if 17 <= h < 21 else 0 for h in hour_of_day]
is_night = [1 if h >= 21 or h < 5 else 0 for h in hour_of_day]

# Target variable - confirm_prob (continuous float between 0 and 1 for regression)
# Higher probability if: more reports, closer distance, within radius, during rush hour
confirm_prob = []
for i in range(n_samples):
    score = 0
    score += (report_count[i] / 25) * 0.3
    score += (1 - distance_mean[i] / 500) * 0.25
    score += pct_within_radius[i] * 0.25
    score += is_rush_hour[i] * 0.1
    score += (unique_reporters[i] / report_count[i]) * 0.1
    
    # Add some random noise to make it more realistic
    score = score + np.random.normal(0, 0.1)
    
    # Clip to ensure it stays between 0 and 1
    score = np.clip(score, 0.0, 1.0)
    
    confirm_prob.append(round(score, 4))

# Create DataFrame
df = pd.DataFrame({
    'bus_id': bus_ids,
    'stop_id': stop_ids,
    'arrival_time': arrival_times,
    'report_count': report_count,
    'unique_reporters': unique_reporters,
    'reports_per_minute': reports_per_minute,
    'time_since_last_report_s': time_since_last_report_s,
    'time_since_first_report_s': time_since_first_report_s,
    'distance_mean': distance_mean,
    'distance_median': distance_median,
    'distance_std': distance_std,
    'pct_within_radius': pct_within_radius,
    'acc_mean': acc_mean,
    'weighted_dist_mean': weighted_dist_mean,
    'prev_arrival_time': prev_arrival_time,
    'time_since_last_arrival_s': time_since_last_arrival_s,
    't_mean': t_mean,
    't_std': t_std,
    'hour_of_day': hour_of_day,
    'day_of_week': day_of_week,
    'is_weekend': is_weekend,
    'is_rush_hour': is_rush_hour,
    'is_early_morning': is_early_morning,
    'is_mid_day': is_mid_day,
    'is_evening': is_evening,
    'is_night': is_night,
    'confirm_prob': confirm_prob
})

# Save to CSV
df.to_csv('arrivals.csv', index=False)
print(f'Generated {len(df)} rows with {len(df.columns)} columns')
print(f"\nColumns: {list(df.columns)}")
print(f"\nFirst 5 rows:")
print(df.head())
print(f"\nTarget distribution:")
print(df['confirm_prob'].value_counts())
print(f"\nData saved to arrivals.csv")
