from pydantic import BaseModel, Field
from typing import Optional

class OccupancyFeatures(BaseModel):
    bus_id: int = Field(description="Bus identifier")
    stop_id: int = Field(description="Stop identifier")
    route_id: Optional[int] = Field(0, description="Route identifier")
    report_time: float = Field(description="Report timestamp (Unix seconds)")
    occupancy_level_reported: int = Field(ge=0, le=5, description="Reported occupancy level (1-5, 0 when predicting)")

    report_count: int = Field(ge=0, default=0, description="Number of reports for this occupancy")
    unique_reporters: int = Field(ge=0, default=0, description="Number of unique reporters")
    reports_per_minute: float = Field(ge=0, default=0, description="Report frequency")
    time_since_last_report_s: float = Field(ge=0, default=0, description="Seconds since last report")
    time_since_first_report_s: float = Field(ge=0, default=0, description="Seconds since first report")

    distance_mean: Optional[float] = Field(0, ge=0, description="Mean distance of reporters from stop (meters)")
    distance_median: Optional[float] = Field(0, ge=0, description="Median distance of reporters from stop")
    distance_std: Optional[float] = Field(0, ge=0, description="Standard deviation of reporter distances")
    pct_within_radius: float = Field(ge=0, le=1, default=0, description="Percentage of reporters within radius")
    weighted_dist_mean: Optional[float] = Field(0, ge=0, description="Accuracy-weighted mean distance")
    acc_mean: float = Field(ge=0, le=1, default=0.5, description="Average reporter accuracy score")

    occupancy_level_mean: float = Field(ge=0, le=5, default=3, description="Mean of reported occupancy levels")
    occupancy_level_std: float = Field(ge=0, default=0, description="Std dev of reported occupancy levels")

    t_mean: float = Field(default=0, description="Mean of reporter timestamps")
    t_std: float = Field(ge=0, default=0, description="Std dev of reporter timestamps")

    historical_avg_occupancy: float = Field(ge=0, le=5, default=3, description="Historical average occupancy for this stop/hour/day")
    historical_sample_count: int = Field(ge=0, default=0, description="Number of historical samples")
    recent_occupancy_level: int = Field(ge=0, le=5, default=0, description="Most recent confirmed occupancy level")
    has_recent_occupancy: int = Field(ge=0, le=1, default=0, description="1 if recent occupancy data exists")

    hour_of_day: int = Field(ge=0, le=23, description="Hour of day (0-23)")
    day_of_week: int = Field(ge=0, le=6, description="Day of week (0=Sunday, 6=Saturday)")
    is_weekend: int = Field(ge=0, le=1, description="1 if weekend, 0 otherwise")
    is_rush_hour: int = Field(ge=0, le=1, description="1 if rush hour")
    is_early_morning: int = Field(ge=0, le=1, default=0, description="1 if early morning (5-9 AM)")
    is_mid_day: int = Field(ge=0, le=1, default=0, description="1 if mid-day (9 AM - 5 PM)")
    is_evening: int = Field(ge=0, le=1, default=0, description="1 if evening (5-9 PM)")
    is_night: int = Field(ge=0, le=1, default=0, description="1 if night (9 PM - 5 AM)")

    rain_1h: float = Field(ge=0, default=0, description="Rain in last hour (mm)")
    snow_1h: float = Field(ge=0, default=0, description="Snow in last hour (mm)")
    temperature: float = Field(ge=-50, le=60, default=25, description="Temperature (Celsius)")
    wind_speed: float = Field(ge=0, default=0, description="Wind speed (m/s)")
    humidity: float = Field(ge=0, le=100, default=50, description="Humidity percentage")
    visibility: float = Field(ge=0, default=10000, description="Visibility (meters)")
    weather_delay_multiplier: float = Field(ge=1.0, default=1.0, description="Weather-based delay multiplier")

    weather_clear: int = Field(ge=0, le=1, default=0, description="1 if clear weather")
    weather_rain: int = Field(ge=0, le=1, default=0, description="1 if rain/drizzle")
    weather_snow: int = Field(ge=0, le=1, default=0, description="1 if snow")
    weather_fog: int = Field(ge=0, le=1, default=0, description="1 if fog/mist/haze")
    weather_clouds: int = Field(ge=0, le=1, default=0, description="1 if cloudy")
    weather_thunderstorm: int = Field(ge=0, le=1, default=0, description="1 if thunderstorm")
    weather_unknown: int = Field(ge=0, le=1, default=0, description="1 if weather unknown")

    class Config:
        json_schema_extra = {
            "example": {
                "bus_id": 1,
                "stop_id": 5,
                "route_id": 1,
                "report_time": 1704567890,
                "occupancy_level_reported": 3,
                "report_count": 4,
                "unique_reporters": 3,
                "reports_per_minute": 2.0,
                "time_since_last_report_s": 15.0,
                "time_since_first_report_s": 60.0,
                "distance_mean": 12.5,
                "distance_median": 10.0,
                "distance_std": 5.0,
                "pct_within_radius": 0.75,
                "weighted_dist_mean": 11.0,
                "acc_mean": 0.8,
                "occupancy_level_mean": 3.25,
                "occupancy_level_std": 0.5,
                "t_mean": 1704567880,
                "t_std": 8.0,
                "historical_avg_occupancy": 3.2,
                "historical_sample_count": 25,
                "recent_occupancy_level": 3,
                "has_recent_occupancy": 1,
                "hour_of_day": 8,
                "day_of_week": 1,
                "is_weekend": 0,
                "is_rush_hour": 1,
                "is_early_morning": 1,
                "is_mid_day": 0,
                "is_evening": 0,
                "is_night": 0,
                "rain_1h": 0.0,
                "snow_1h": 0.0,
                "temperature": 28.0,
                "wind_speed": 3.0,
                "humidity": 65,
                "visibility": 10000,
                "weather_delay_multiplier": 1.0,
                "weather_clear": 1,
                "weather_rain": 0,
                "weather_snow": 0,
                "weather_fog": 0,
                "weather_clouds": 0,
                "weather_thunderstorm": 0,
                "weather_unknown": 0
            }
        }
