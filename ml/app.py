from fastapi import FastAPI
from training.train_arrival import train_all_models
from inference.predict_arrival import predict_arrival
from pydantic import BaseModel
import pandas as pd
from schemas.arrival_features import ArrivalFeatures

app = FastAPI()

@app.post("/predict-arrival")
def predict(data: ArrivalFeatures):
    prob = predict_arrival(data)
    return {
        "confirm_probability": prob,
        "confirm": prob >= 0.6
    }

@app.post("/store-arrival")
def store(data: dict):
    df = pd.DataFrame([data])
    df.to_csv("data/arrivals/arrivals.csv", mode="a", header=False, index=False)
    return {"status": "stored"}

@app.post("/train-arrival")
def train():
    metrics = train_all_models()
    return metrics