from fastapi import FastAPI
from training.train_arrival import train_arrival_models
from training.train_eta import train_eta_models
from inference.predict_arrival import predict_arrival as predict_arrival_inference
from inference.predict_eta import predict_eta as predict_eta_inference
from pydantic import BaseModel
import pandas as pd
from schemas.arrival_features import ArrivalFeatures
from schemas.eta_features import ETAFeatures

app = FastAPI()

@app.post("/train-arrival")
def train_arrival():
    metrics = train_arrival_models()
    return metrics

@app.post("/predict-arrival")
def predict_arrival_endpoint(data: ArrivalFeatures):
    prob = predict_arrival_inference(data)
    return {
        "confirm_probability": prob,
        "confirm": prob >= 0.6
    }

@app.post("/store-arrival")
def store_arrival(data: dict):
    df = pd.DataFrame([data])
    df.to_csv("data/arrivals/arrivals.csv", mode="a", header=False, index=False)
    return {"status": "stored"}


@app.post("/train-eta")
def train_eta():
    metrics = train_eta_models()
    return metrics

@app.post("/predict-eta")
def predict_eta_endpoint(data: ETAFeatures):
    eta_seconds = predict_eta_inference(data)
    
    return {
        "eta_seconds": float(eta_seconds),
        "eta_minutes": round(eta_seconds / 60, 2),
        "confidence": data.checkpoint_freshness_score
    }

@app.post("/store-eta")
def store_eta(data: dict):
    df = pd.DataFrame([data])
    df.to_csv("data/eta/eta_training.csv", mode="a", header=False, index=False)
    return {"status": "stored"}
