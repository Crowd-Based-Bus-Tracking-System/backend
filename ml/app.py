from fastapi import FastAPI
from training.train_arrival import train_all_models
from inference.predict_arrival import predict_arrival
from pydantic import BaseModel
import pandas as pd

app = FastAPI()

class ArrivalFeatures(BaseModel):
    features: dict
    label: float | None = None

@app.post("/predict-arrival")
def predict(data: ArrivalFeatures):
    prob = predict_arrival(data.features)
    return {
        "confirm_probability": prob,
        "confirm": prob >=0.6
    }

@app.post("/store-arrival")
def store(data: ArrivalFeatures):
    df = pd.DataFrame([data.features | {"label": data.label}])
    df.to_csv("data/arrivals/arrivals.csv", mode="a", header=False, index=False)
    return {"status": "stored"}

@app.post("/train-arrival")
def train():
    metrics = train_all_models()
    return metrics