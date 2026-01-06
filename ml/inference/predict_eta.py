import joblib
import numpy as np
import os
from schemas.eta_features import ETAFeatures

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "best_model_eta.pkl")
model = joblib.load(MODEL_PATH)

def predict_eta(features: ETAFeatures) -> float:
    feature_order_path = os.path.join(os.path.dirname(__file__), "..", "models", "eta_feature_order.pkl")
    feature_order = joblib.load(feature_order_path)

    feature_dict = features.dict()

    feature_values = []
    for f in feature_order:
        value = feature_dict.get(f, 0)
        if value is None:
            value = 0
        feature_values.append(value)

    X = np.array([feature_values], dtype=np.float64)

    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    eta = model.predict(X)[0]

    return float(np.clip(eta, 0.0, 432000.0))