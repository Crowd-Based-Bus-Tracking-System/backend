import pandas as pd
import numpy as np

# Read the current data
df = pd.read_csv(r'c:\Users\ASUS\Projects\Bus-Tracking-System\backend\ml\data\arrivals\arrivals.csv')

print(f"Original shape: {df.shape}")
print(f"Original acc_mean range: {df['acc_mean'].min()} - {df['acc_mean'].max()}")

# Fix acc_mean: convert from 0-100 scale to 0-1 scale
df['acc_mean'] = df['acc_mean'] / 100.0
df['acc_mean'] = df['acc_mean'].clip(0, 1)  # Ensure it's between 0 and 1

# Add missing weather columns with realistic default values
df['rain_1h'] = 0.0  # No rain by default
df['snow_1h'] = 0.0  # No snow by default
df['temperature'] = 28.0  # Default temperature in Celsius (Sri Lanka avg)
df['wind_speed'] = 3.5  # Default wind speed in m/s
df['humidity'] = 65.0  # Default humidity percentage
df['visibility'] = 10000.0  # Default visibility in meters (10km)
df['weather_delay_multiplier'] = 1.0  # No weather delay by default

# Add some variety to weather data based on hour and day
np.random.seed(42)
for idx in range(len(df)):
    hour = df.loc[idx, 'hour_of_day']
    
    # Add some rain during evening hours (probability)
    if hour >= 16 and hour <= 20:
        if np.random.random() < 0.3:  # 30% chance of rain in evening
            df.loc[idx, 'rain_1h'] = np.random.uniform(0.5, 5.0)
            df.loc[idx, 'weather_delay_multiplier'] = np.random.uniform(1.05, 1.15)
            df.loc[idx, 'visibility'] = np.random.uniform(5000, 8000)
    
    # Vary temperature based on time of day
    if hour >= 6 and hour < 12:  # Morning
        df.loc[idx, 'temperature'] = np.random.uniform(24, 28)
    elif hour >= 12 and hour < 18:  # Afternoon (hottest)
        df.loc[idx, 'temperature'] = np.random.uniform(28, 33)
    elif hour >= 18 and hour < 22:  # Evening
        df.loc[idx, 'temperature'] = np.random.uniform(26, 30)
    else:  # Night
        df.loc[idx, 'temperature'] = np.random.uniform(23, 27)
    
    # Vary humidity
    df.loc[idx, 'humidity'] = np.random.uniform(55, 80)
    
    # Vary wind speed slightly
    df.loc[idx, 'wind_speed'] = np.random.uniform(2.0, 6.0)

print(f"\nFixed acc_mean range: {df['acc_mean'].min()} - {df['acc_mean'].max()}")
print(f"New shape: {df.shape}")
print(f"New columns added: rain_1h, snow_1h, temperature, wind_speed, humidity, visibility, weather_delay_multiplier")

# Save the updated dataset
output_path = r'c:\Users\ASUS\Projects\Bus-Tracking-System\backend\ml\data\arrivals\arrivals.csv'
df.to_csv(output_path, index=False)
print(f"\n✅ Dataset saved to: {output_path}")
print(f"Total columns: {len(df.columns)}")
print(f"Columns: {list(df.columns)}")
