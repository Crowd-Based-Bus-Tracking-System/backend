import joblib
import numpy as np
import os
from schemas.arrival_features import ArrivalFeatures

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "best_model_arrival.pkl")
model = joblib.load(MODEL_PATH)

def predict_arrival(features: ArrivalFeatures) -> float:
    feature_order = [
        "bus_id", "stop_id", "arrival_time", "report_count", "unique_reporters",
        "reports_per_minute", "time_since_last_report_s", "time_since_first_report_s",
        "distance_mean", "distance_median", "distance_std", "pct_within_radius",
        "acc_mean", "weighted_dist_mean", "prev_arrival_time", "time_since_last_arrival_s",
        "t_mean", "t_std", "hour_of_day", "day_of_week", "is_weekend",
        "is_rush_hour", "is_early_morning", "is_mid_day", "is_evening", "is_night"
    ]
    
    feature_dict = features.dict()
    
    feature_values = []
    for f in feature_order:
        value = feature_dict.get(f, 0)
        if value is None:
            value = 0
        feature_values.append(value)
    
    X = np.array([feature_values], dtype=np.float64)
    
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    
    prob = model.predict(X)[0]
    
    return float(np.clip(prob, 0.0, 1.0))