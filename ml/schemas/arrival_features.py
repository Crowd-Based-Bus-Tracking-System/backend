from pydantic import BaseModel, Field
from typing import Optional

class ArrivalFeatures(BaseModel):
    bus_id: int = Field(description="Bus identifier")
    stop_id: int = Field(description="Stop identifier")
    arrival_time: float = Field(description="Reported arrival timestamp (Unix ms)")
    
    report_count: int = Field(ge=0, description="Number of reports for this arrival")
    unique_reporters: int = Field(ge=0, description="Number of unique reporters")
    reports_per_minute: float = Field(ge=0, description="Report frequency")
    time_since_last_report_s: float = Field(ge=0, description="Seconds since last report")
    time_since_first_report_s: float = Field(ge=0, description="Seconds since first report")
    
    distance_mean: Optional[float] = Field(None, ge=0, description="Mean distance of reporters from stop (meters)")
    distance_median: Optional[float] = Field(None, ge=0, description="Median distance of reporters from stop")
    distance_std: Optional[float] = Field(None, ge=0, description="Standard deviation of reporter distances")
    pct_within_radius: float = Field(ge=0, le=1, description="Percentage of reporters within radius")
    weighted_dist_mean: Optional[float] = Field(None, ge=0, description="Accuracy-weighted mean distance")
    
    acc_mean: float = Field(ge=0, le=1, description="Average reporter accuracy score")
    
    prev_arrival_time: Optional[float] = Field(None, description="Previous arrival timestamp")
    time_since_last_arrival_s: Optional[float] = Field(None, ge=0, description="Time since bus last arrived")
    
    t_mean: float = Field(description="Mean of reporter timestamps")
    t_std: float = Field(ge=0, description="Std dev of reporter timestamps")
    
    hour_of_day: int = Field(ge=0, le=23, description="Hour of day (0-23)")
    day_of_week: int = Field(ge=0, le=6, description="Day of week (0=Sunday, 6=Saturday)")
    is_weekend: int = Field(ge=0, le=1, description="1 if weekend, 0 otherwise")
    is_rush_hour: int = Field(ge=0, le=1, description="1 if rush hour (7-10 AM or 5-8 PM)")
    is_early_morning: int = Field(ge=0, le=1, description="1 if early morning (5-9 AM)")
    is_mid_day: int = Field(ge=0, le=1, description="1 if mid-day (9 AM - 5 PM)")
    is_evening: int = Field(ge=0, le=1, description="1 if evening (5-9 PM)")
    is_night: int = Field(ge=0, le=1, description="1 if night (9 PM - 5 AM)")
    
    rain_1h: float = Field(ge=0, description="Rain in last hour (mm)")
    snow_1h: float = Field(ge=0, description="Snow in last hour (mm)")
    temperature: float = Field(ge=-50, le=60, description="Temperature (Celsius)")
    wind_speed: float = Field(ge=0, description="Wind speed (m/s)")
    humidity: float = Field(ge=0, le=100, description="Humidity percentage")
    visibility: float = Field(ge=0, description="Visibility (meters)")
    weather_delay_multiplier: float = Field(ge=1.0, description="Weather-based delay multiplier")
    
    weather_clear: int = Field(ge=0, le=1, default=0, description="1 if clear weather")
    weather_rain: int = Field(ge=0, le=1, default=0, description="1 if rain/drizzle")
    weather_snow: int = Field(ge=0, le=1, default=0, description="1 if snow")
    weather_fog: int = Field(ge=0, le=1, default=0, description="1 if fog/mist/haze")
    weather_clouds: int = Field(ge=0, le=1, default=0, description="1 if cloudy")
    weather_thunderstorm: int = Field(ge=0, le=1, default=0, description="1 if thunderstorm")
    weather_unknown: int = Field(ge=0, le=1, default=0, description="1 if weather unknown")
    
    # Traffic & Events (2 features)
    traffic_level: int = Field(ge=0, le=4, default=0, description="0=unknown, 1=low, 2=medium, 3=high, 4=severe")
    event_nearby: int = Field(ge=0, le=1, default=0, description="1 if special event nearby")
    
    class Config:
        schema_extra = {
            "example": {
                "bus_id": 123,
                "stop_id": 456,
                "arrival_time": 1704567890000,
                "report_count": 5,
                "unique_reporters": 4,
                "reports_per_minute": 2.5,
                "time_since_last_report_s": 10.5,
                "time_since_first_report_s": 45.2,
                "distance_mean": 15.3,
                "distance_median": 12.0,
                "distance_std": 8.5,
                "pct_within_radius": 0.8,
                "weighted_dist_mean": 14.2,
                "acc_mean": 0.85,
                "prev_arrival_time": 1704563290000,
                "time_since_last_arrival_s": 4600,
                "t_mean": 1704567880,
                "t_std": 5.2,
                "hour_of_day": 14,
                "day_of_week": 3,
                "is_weekend": 0,
                "is_rush_hour": 0,
                "is_early_morning": 0,
                "is_mid_day": 1,
                "is_evening": 0,
                "is_night": 0,
                "rain_1h": 0.0,
                "snow_1h": 0.0,
                "temperature": 28.5,
                "wind_speed": 3.2,
                "humidity": 65,
                "visibility": 10000,
                "weather_delay_multiplier": 1.0,
                "weather_clear": 1,
                "weather_rain": 0,
                "weather_snow": 0,
                "weather_fog": 0,
                "weather_clouds": 0,
                "weather_thunderstorm": 0,
                "weather_unknown": 0,
                "traffic_level": 2,
                "event_nearby": 0
            }
        }