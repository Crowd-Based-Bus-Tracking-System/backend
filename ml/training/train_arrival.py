import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
import joblib
import os


DATA_PATH = "../data/arrivals.csv"
def train_all_models(data_path=DATA_PATH):
    df = pd.read_csv(DATA_PATH)

    FEATURE_COLUMNS = [
        bus_id,
        stop_id,
        arrival_time,
        report_count,
        unique_reporters,
        reports_per_minute,
        time_since_last_report_s,
        time_since_first_report_s,
        distance_mean,
        distance_median,
        distance_std,
        pct_within_radius,
        acc_mean,
        weighted_dist_mean,
        prev_arrival_time,
        time_since_last_arrival_s,
        t_mean,
        t_std,
        hour_of_day,
        day_of_week,
        is_weekend,
        is_rush_hour,
        is_early_morning,
        is_mid_day,
        is_evening,
        is_night,
    ]

    X = df[FEATURE_COLUMNS]
    y = df["confirm_prob"]

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    models = {
        "logistic": {
            "pipeline": Pipeline([
                ("scaler", StandardScaler()),
                ("clf", LogisticRegression(max_iter=200))
            ]),
            "params": {
                "clf__C": [0.1, 1, 10]
            }
        },
        "random_forest": {
            "pipeline": Pipeline([
                ("clf", RandomForestClassifier())
            ]),
            "params": {
                "clf__n_estimators": [100, 200],
                "clf__max_depth": [None, 10, 20],
                "clf__min_samples_split": [2, 5]
            }
        },
        "gradient_boosting": {
            "pipeline": Pipeline([
                ("clf", GradientBoostingClassifier())
            ]),
            "params": {
                "clf__n_estimators": [100, 200],
                "clf__learning_rate": [0.05, 0.1],
                "clf__max_depth": [3, 5]
            }
        },
        "svm": {
            "pipeline": Pipeline([
                ("scaler", StandardScaler()),
                ("clf", SVC(probability=True))
            ]),
            "params": {
                "clf__C": [0.5, 1, 5],
                "clf__kernel": ["rbf"]
            }
        }
    }

    best_model = None
    best_score = 0
    best_name = None

    for name, cfg in models.items():
        print(f"\nTraining model: {name}")

        grid = GridSearchCV(
            cfg["pipeline"],
            cfg["params"],
            scoring="accuracy",
            cv=5,
            n_jobs=-1
        )

        grid.fit(X_train, y_train)
        preds = grid.predict(X_val)
        acc = accuracy_score(y_val, preds)

        print(f"{name} accuracy: {acc:.4f}")
        print(classification_report(y_val, preds))

        if acc > best_score:
            best_score = acc
            best_model = grid.best_estimator_
            best_name = name

    os.makedirs("models", exist_ok=True)
    joblib.dump(best_model, "models/best_model_arrival.pkl")

    print("\nBEST MODEL")
    print(f"Model: {best_name}")
    print(f"Accuracy: {best_score:.4f}")
    print("Saved to models/best_model_arrival.pkl")