import pandas as pd
import numpy as np

# Read the original data - handling any parsing issues
try:
    df = pd.read_csv(r'c:\Users\ASUS\Projects\Bus-Tracking-System\backend\ml\data\arrivals\arrivals.csv', on_bad_lines='skip')
except:
    # If that fails, try with error_bad_lines=False for older pandas
    df = pd.read_csv(r'c:\Users\ASUS\Projects\Bus-Tracking-System\backend\ml\data\arrivals\arrivals.csv', error_bad_lines=False, warn_bad_lines=True)

print(f"Loaded datafrom: {df.shape}")

# Fix acc_mean: convert from 0-100 scale to 0-1 scale
if 'acc_mean' in df.columns:
    df['acc_mean'] = df['acc_mean'] / 100.0
    df['acc_mean'] = df['acc_mean'].clip(0, 1)

# Add missing weather columns if they don't exist
weather_columns = {
    'rain_1h': 0.0,
    'snow_1h': 0.0,
    'temperature': 28.0,
    'wind_speed': 3.5,
    'humidity': 65.0,
    'visibility': 10000.0,
    'weather_delay_multiplier': 1.0
}

for col, default_val in weather_columns.items():
    if col not in df.columns:
        df[col] = default_val

# Add variety to weather
np.random.seed(42)
for idx in df.index:
    hour = df.loc[idx, 'hour_of_day']
    
    # Evening rain
    if 16 <= hour <= 20 and np.random.random() < 0.3:
        df.loc[idx, 'rain_1h'] = np.random.uniform(0.5, 5.0)
        df.loc[idx, 'weather_delay_multiplier'] = np.random.uniform(1.05, 1.15)
        df.loc[idx, 'visibility'] = np.random.uniform(5000, 8000)
    
    # Temperature by time of day
    if 6 <= hour < 12:
        df.loc[idx, 'temperature'] = np.random.uniform(24, 28)
    elif 12 <= hour < 18:
        df.loc[idx, 'temperature'] = np.random.uniform(28, 33)
    elif 18 <= hour < 22:
        df.loc[idx, 'temperature'] = np.random.uniform(26, 30)
    else:
        df.loc[idx, 'temperature'] = np.random.uniform(23, 27)
    
    df.loc[idx, 'humidity'] = np.random.uniform(55, 80)
    df.loc[idx, 'wind_speed'] = np.random.uniform(2.0, 6.0)

print(f"Final shape: {df.shape}")
print(f"Columns: {list(df.columns)}")

# Save
output_path = r'c:\Users\ASUS\Projects\Bus-Tracking-System\backend\ml\data\arrivals\arrivals.csv'
df.to_csv(output_path, index=False)
print(f"\n✅ Saved to: {output_path}")
