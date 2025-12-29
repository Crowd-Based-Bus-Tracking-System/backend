from fastapi import FastAPI
from ml.training.train_arrival import train_all_models
from ml.training.predict_arrival import predict_arrival
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
        "confirm": prob >=0.8
    }

@app.post("/store-arrival")
def store(data: ArrivalFeatures):
    df = pd.DataFrame([data.features | {"label": data.label}])
    df.to_csv("data/arrivals.csv", mode="a", header=False, index=False)
    return {"status": "stored"}

@app.post("/train-arrival")
def train():
    metrics = train_all_models()
    return metrics