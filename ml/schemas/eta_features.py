from pydantic import BaseModel, Field
from typing import Optional

class ETAFeatures(BaseModel):
    """
    Features for ML-based ETA (Estimated Time of Arrival) prediction.
    Designed for GPS-free crowdsourced bus tracking systems.
    """
    
    # ========== METADATA (3 fields) ==========
    bus_id: int = Field(description="Bus identifier")
    target_stop_id: int = Field(description="Target stop to predict ETA for")
    prediction_made_at: float = Field(description="Timestamp when prediction is being made (Unix ms)")
    
    # ========== SCHEDULE & DELAY FEATURES (10) ==========
    scheduled_arrival_time: Optional[float] = Field(None, description="Scheduled arrival timestamp (Unix ms)")
    seconds_until_scheduled: Optional[float] = Field(None, description="Seconds until scheduled arrival")
    current_delay_seconds: float = Field(default=0, description="Current delay at last checkpoint (seconds)")
    delay_at_last_stop: float = Field(default=0, description="Delay measured at last confirmed stop")
    avg_delay_this_route_today: float = Field(default=0, description="Average delay for this route today")
    avg_delay_same_hour: float = Field(default=0, description="Historical avg delay for this hour")
    schedule_adherence_score: float = Field(ge=0, le=1, default=0.5, description="Schedule adherence (0-1, higher is better)")
    delay_trend_last_3_stops: float = Field(default=0, description="Delay trend over last 3 stops (seconds)")
    is_delay_accelerating: int = Field(ge=0, le=1, default=0, description="1 if delay is getting worse")
    delay_per_stop_rate: float = Field(default=0, description="Rate of delay change per stop (seconds/stop)")
    
    # ========== ROUTE & SEGMENT FEATURES (9) ==========
    stops_remaining: int = Field(ge=0, description="Number of stops remaining to target")
    pct_route_completed: float = Field(ge=0, le=1, default=0, description="Percentage of route completed")
    distance_remaining_km: float = Field(ge=0, default=0, description="Estimated remaining distance (km)")
    total_segment_time_remaining: float = Field(ge=0, default=0, description="Sum of all remaining segment times (seconds)")
    avg_segment_time_remaining: float = Field(ge=0, default=0, description="Average time per remaining segment")
    stddev_segment_time: float = Field(ge=0, default=0, description="Std dev of segment times")
    min_segment_time: float = Field(ge=0, default=0, description="Minimum segment time in remaining route")
    max_segment_time: float = Field(ge=0, default=0, description="Maximum segment time in remaining route")
    segment_time_variance: float = Field(ge=0, default=0, description="Variance of segment times")
    
    # ========== CHECKPOINT FRESHNESS FEATURES (7) - GPS-Free Specific ==========
    minutes_since_last_checkpoint: Optional[float] = Field(None, ge=0, description="Minutes since last confirmed arrival")
    checkpoint_freshness_score: float = Field(ge=0, le=1, default=0, description="Freshness score (1=just confirmed, 0=very stale)")
    checkpoint_age_penalty: float = Field(ge=1, default=2.0, description="Uncertainty multiplier based on data age")
    has_recent_checkpoint: int = Field(ge=0, le=1, default=0, description="1 if checkpoint within last 10 minutes")
    stops_since_last_checkpoint: float = Field(ge=0, default=0, description="Estimated stops passed since checkpoint")
    time_to_next_expected_report: Optional[float] = Field(None, ge=0, description="Expected seconds until next report")
    checkpoint_reliability_score: float = Field(ge=0, le=1, default=0.5, description="Historical checkpoint reliability")
    
    # ========== HISTORICAL PATTERN FEATURES (10) ==========
    historical_delay_avg: float = Field(default=0, description="Historical average delay for this route/time")
    historical_delay_p50: float = Field(default=0, description="Median historical delay (50th percentile)")
    historical_delay_p90: float = Field(default=0, description="90th percentile historical delay")
    same_day_hour_avg_delay: float = Field(default=0, description="Avg delay for same day/hour combination")
    recent_24h_performance: float = Field(ge=0, le=1, default=0.5, description="On-time performance in last 24h")
    recent_7d_performance: float = Field(ge=0, le=1, default=0.5, description="On-time performance in last 7 days")
    route_punctuality_score: float = Field(ge=0, le=1, default=0.5, description="Overall route punctuality")
    historical_completion_rate: float = Field(ge=0, le=1, default=0.9, description="Route completion rate")
    typical_delay_this_stop: float = Field(default=0, description="Typical delay at this specific stop")
    historical_sample_count: int = Field(ge=0, default=0, description="Number of historical samples used")
    
    # ========== TIME FEATURES (6) ==========
    hour_of_day: int = Field(ge=0, le=23, description="Hour of day (0-23)")
    day_of_week: int = Field(ge=0, le=6, description="Day of week (0=Sunday, 6=Saturday)")
    is_weekend: int = Field(ge=0, le=1, description="1 if weekend, 0 otherwise")
    is_rush_hour: int = Field(ge=0, le=1, description="1 if rush hour (7-10 AM or 5-8 PM)")
    is_peak_period: int = Field(ge=0, le=1, description="1 if peak period (7 AM - 8 PM weekday)")
    minutes_into_rush_hour: float = Field(ge=0, default=0, description="Minutes into current rush hour")
    
    # ========== WEATHER & CONTEXT FEATURES (10) ==========
    temperature: float = Field(ge=-50, le=60, default=20, description="Temperature (Celsius)")
    rain_1h: float = Field(ge=0, default=0, description="Rain in last hour (mm)")
    snow_1h: float = Field(ge=0, default=0, description="Snow in last hour (mm)")
    visibility: float = Field(ge=0, default=10000, description="Visibility (meters)")
    wind_speed: float = Field(ge=0, default=0, description="Wind speed (m/s)")
    humidity: float = Field(ge=0, le=100, default=50, description="Humidity percentage")
    weather_delay_multiplier: float = Field(ge=1.0, default=1.0, description="Weather-based delay multiplier")
    traffic_level_encoded: int = Field(ge=0, le=4, default=0, description="0=unknown, 1=low, 2=medium, 3=high, 4=severe")
    is_holiday: int = Field(ge=0, le=1, default=0, description="1 if public holiday")
    is_special_event: int = Field(ge=0, le=1, default=0, description="1 if special event nearby")
    
    # ========== WEATHER CONDITION FLAGS (7) - One-Hot Encoded ==========
    weather_clear: int = Field(ge=0, le=1, default=0, description="1 if clear weather")
    weather_rain: int = Field(ge=0, le=1, default=0, description="1 if rain/drizzle")
    weather_snow: int = Field(ge=0, le=1, default=0, description="1 if snow")
    weather_fog: int = Field(ge=0, le=1, default=0, description="1 if fog/mist/haze")
    weather_clouds: int = Field(ge=0, le=1, default=0, description="1 if cloudy")
    weather_thunderstorm: int = Field(ge=0, le=1, default=0, description="1 if thunderstorm")
    weather_unknown: int = Field(ge=0, le=1, default=0, description="1 if weather unknown")
    
    # ========== REPORTER FEATURES (6) - Crowdsourced Unique ==========
    reporters_at_target_stop: int = Field(ge=0, default=0, description="Number of reporters waiting at target stop")
    avg_reporter_accuracy_target: float = Field(ge=0, le=1, default=0.5, description="Average accuracy of reporters at target")
    recent_report_density: float = Field(ge=0, default=0, description="Reports per minute recently")
    report_consensus_strength: float = Field(ge=0, le=1, default=0, description="Agreement among reporters")
    has_high_quality_reporter: int = Field(ge=0, le=1, default=0, description="1 if any reporter with >90% accuracy present")
    reporter_cluster_tightness: float = Field(ge=0, default=0, description="How clustered are reporter positions")
    
    class Config:
        schema_extra = {
            "example": {
                "bus_id": 123,
                "target_stop_id": 456,
                "prediction_made_at": 1704567890000,
                "checkpoint_freshness_score": 0.82,
                "stops_remaining": 3,
                "current_delay_seconds": 120
            }
        }
