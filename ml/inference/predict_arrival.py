import joblib
import numpy as np


model = joblib.load("../models/best_model_arrival.pkl")

def predict_arrival(features: dict) -> float:
    X = np.array([list(features.values())])
    return model.predict_proba(X)[0][1]