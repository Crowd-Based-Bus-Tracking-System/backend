import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.svm import SVR
import joblib
import os
from pydantic import ValidationError
from schemas.arrival_features import ArrivalFeatures

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "..", "data", "arrivals", "arrivals.csv")

def train_arrival_models(data_path=DATA_PATH):
    print(f"\nLoading data from: {data_path}")
    df = pd.read_csv(data_path)

    print("\nValidating features with Pydantic schema...")
    validated_data = []
    validation_errors = 0
    
    for idx, row in df.iterrows():
        try:
            arrival_features = ArrivalFeatures(**row.to_dict())
            validated_data.append(arrival_features.dict())
        except ValidationError as e:
            validation_errors += 1
            if validation_errors <= 5:
                print(f"Validation error for row {idx}: {e}")
    
    if validation_errors > 0:
        print(f"\nTotal validation errors: {validation_errors}/{len(df)}")
        print(f"Valid rows: {len(validated_data)}")
    else:
        print(f"All {len(validated_data)} rows validated successfully")
    
    df = pd.DataFrame(validated_data)
    
    FEATURE_COLUMNS = [
        field for field in ArrivalFeatures.__fields__
        if field not in ["bus_id", "stop_id", "arrival_time"]
    ]
    
    print(f"\nUsing {len(FEATURE_COLUMNS)} features from Pydantic schema")

    TARGET_COLUMN = "confirm_prob"

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    models = {
        "linear_regression": {
            "pipeline": Pipeline([
                ("scaler", StandardScaler()),
                ("reg", LinearRegression())
            ]),
            "params": {}
        },
        "ridge": {
            "pipeline": Pipeline([
                ("scaler", StandardScaler()),
                ("reg", Ridge())
            ]),
            "params": {
                "reg__alpha": [0.1, 1, 10]
            }
        },
        "random_forest": {
            "pipeline": Pipeline([
                ("reg", RandomForestRegressor(random_state=42))
            ]),
            "params": {
                "reg__n_estimators": [100, 200],
                "reg__max_depth": [None, 10, 20],
                "reg__min_samples_split": [2, 5]
            }
        },
        "gradient_boosting": {
            "pipeline": Pipeline([
                ("reg", GradientBoostingRegressor(random_state=42))
            ]),
            "params": {
                "reg__n_estimators": [100, 200],
                "reg__learning_rate": [0.05, 0.1],
                "reg__max_depth": [3, 5]
            }
        },
        "svr": {
            "pipeline": Pipeline([
                ("scaler", StandardScaler()),
                ("reg", SVR())
            ]),
            "params": {
                "reg__C": [0.5, 1, 5],
                "reg__kernel": ["rbf"]
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
            scoring="neg_mean_squared_error",
            cv=5,
            n_jobs=-1
        )

        grid.fit(X_train, y_train)
        preds = grid.predict(X_val)
        
        mse = mean_squared_error(y_val, preds)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_val, preds)
        r2 = r2_score(y_val, preds)

        print(f"{name} metrics:")
        print(f"  RMSE: {rmse:.4f}")
        print(f"  MAE: {mae:.4f}")
        print(f"  R²: {r2:.4f}")

        if rmse < best_score or best_score == 0:
            best_score = rmse
            best_model = grid.best_estimator_
            best_name = name

    model_dir = os.path.join(SCRIPT_DIR, "..", "models")
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, "best_model_arrival.pkl")
    feature_order_path = os.path.join(model_dir, "arrival_feature_order.pkl")

    joblib.dump(best_model, model_path)
    joblib.dump(FEATURE_COLUMNS, feature_order_path)

    print("\nBEST MODEL")
    print(f"Model: {best_name}")
    print(f"RMSE: {best_score:.4f}")
    print(f"Saved to {model_path}")
    
    return {
        "model": best_name,
        "rmse": round(best_score, 4),
        "model_path": str(model_path)
    }

if __name__ == "__main__":
    train_all_models()