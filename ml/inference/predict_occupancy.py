import joblib
import numpy as np
import os
from schemas.occupancy_features import OccupancyFeatures

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "best_model_occupancy.pkl")
FEATURE_ORDER_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "occupancy_feature_order.pkl")

model = None
feature_order = None

def load_model():
    global model, feature_order
    if os.path.exists(MODEL_PATH) and os.path.exists(FEATURE_ORDER_PATH):
        model = joblib.load(MODEL_PATH)
        feature_order = joblib.load(FEATURE_ORDER_PATH)
    else:
        print("Occupancy model not found. Predictions will use fallback.")

load_model()

def predict_occupancy(features: OccupancyFeatures) -> dict:
    if model is None or feature_order is None:
        reported = features.occupancy_level_reported
        historical = features.historical_avg_occupancy
        
        if reported > 0:
            level = reported
        elif historical > 0:
            level = round(historical)
        else:
            level = 3
        
        return {
            "predicted_level": int(max(1, min(5, level))),
            "confirm_probability": 0.5,
            "confirm": True,
            "confidence": 0.3,
            "method": "fallback"
        }
    
    feature_dict = features.dict()
    
    feature_values = []
    for f in feature_order:
        value = feature_dict.get(f, 0)
        if value is None:
            value = 0
        feature_values.append(value)
    
    X = np.array([feature_values], dtype=np.float64)
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    
    prediction = model.predict(X)[0]
    predicted_level = int(max(1, min(5, round(prediction))))
    
    if features.report_count > 0 and features.occupancy_level_reported > 0:
        level_diff = abs(predicted_level - features.occupancy_level_reported)
        confirm_prob = max(0.2, 1.0 - (level_diff * 0.25))
    else:
        confirm_prob = 0.5
    
    return {
        "predicted_level": predicted_level,
        "confirm_probability": float(np.clip(confirm_prob, 0.0, 1.0)),
        "confirm": confirm_prob >= 0.4,
        "confidence": float(np.clip(confirm_prob, 0.0, 1.0)),
        "method": "ml_model"
    }
