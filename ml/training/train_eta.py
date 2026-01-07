import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score,  mean_absolute_percentage_error
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, ExtraTreesRegressor
from lightgbm import LGBMRegressor
from xgboost import XGBRegressor
import joblib
import os
from pydantic import ValidationError
from schemas.eta_features import ETAFeatures

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "..", "data", "eta", "eta_training.csv")

def train_eta_models(data_path=DATA_PATH):
    print(f"\nLoading data from: {data_path}")
    df = pd.read_csv(data_path)
    
    print("\nValidating features with Pydantic schema...")
    validated_data = []
    validation_errors = 0
    
    for idx, row in df.iterrows():
        try:
            eta_features = ETAFeatures(**row.to_dict())
            validated_data.append(eta_features.dict())
        except ValidationError as e:
            validation_errors += 1
            if validation_errors <= 5:
                print(f"  ⚠️ Row {idx}: {e}")
    
    if validation_errors > 0:
        print(f"\nTotal validation errors: {validation_errors}/{len(df)}")
        print(f"Valid rows: {len(validated_data)}")
    else:
        print(f"All {len(validated_data)} rows validated successfully")
    
    if len(validated_data) == 0:
        raise ValueError("No valid data after validation!")
    
    df = pd.DataFrame(validated_data)
    
    FEATURE_COLUMNS = [
        field for field in ETAFeatures.__fields__
        if field not in ["bus_id", "target_stop_id", "prediction_made_at"]
    ]
    
    TARGET_COLUMN = "actual_eta_seconds"
    
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Target column '{TARGET_COLUMN}' not found in data!")
    
    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]
    
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=True
    )
    
    models = {
        "lightgbm": {
            "pipeline": Pipeline([
                ("reg", LGBMRegressor(random_state=42, verbose=-1))
            ]),
            "params": {
                "reg__n_estimators": [100, 200, 300],
                "reg__learning_rate": [0.01, 0.05, 0.1],
                "reg__max_depth": [5, 7, 10],
                "reg__num_leaves": [31, 50, 70],
                "reg__min_child_samples": [20, 30, 50]
            }
        },
        "xgboost": {
            "pipeline": Pipeline([
                ("reg", XGBRegressor(random_state=42, eval_metric='rmse'))
            ]),
            "params": {
                "reg__n_estimators": [100, 200, 300],
                "reg__learning_rate": [0.01, 0.05, 0.1],
                "reg__max_depth": [4, 6, 8],
                "reg__min_child_weight": [1, 3, 5],
                "reg__subsample": [0.8, 0.9, 1.0]
            }
        },
        "random_forest": {
            "pipeline": Pipeline([
                ("reg", RandomForestRegressor(random_state=42, n_jobs=-1))
            ]),
            "params": {
                "reg__n_estimators": [100, 200, 300],
                "reg__max_depth": [10, 15, 20, None],
                "reg__min_samples_split": [2, 5, 10],
                "reg__min_samples_leaf": [1, 2, 4],
                "reg__max_features": ["sqrt", "log2"]
            }
        },
        "gradient_boosting": {
            "pipeline": Pipeline([
                ("reg", GradientBoostingRegressor(random_state=42))
            ]),
            "params": {
                "reg__n_estimators": [100, 200, 300],
                "reg__learning_rate": [0.05, 0.1, 0.15],
                "reg__max_depth": [3, 5, 7],
                "reg__min_samples_split": [2, 5, 10],
                "reg__subsample": [0.8, 0.9, 1.0]
            }
        },
        "extra_trees": {
            "pipeline": Pipeline([
                ("reg", ExtraTreesRegressor(random_state=42, n_jobs=-1))
            ]),
            "params": {
                "reg__n_estimators": [100, 200],
                "reg__max_depth": [10, 15, 20],
                "reg__min_samples_split": [2, 5],
                "reg__min_samples_leaf": [1, 2]
            }
        }
    }
    
    best_model = None
    best_score = float('inf')
    best_name = None
    results = []
    
    print("\n" + "=" * 60)
    print("TRAINING MODELS")
    print("=" * 60)
    
    for name, cfg in models.items():
        print(f"\nTraining: {name.upper()}")
        print(f"  Hyperparameter combinations: {np.prod([len(v) for v in cfg['params'].values()])}")
        
        grid = GridSearchCV(
            cfg["pipeline"],
            cfg["params"],
            scoring="neg_mean_squared_error",
            cv=5,
            n_jobs=-1,
            verbose=0
        )
        
        grid.fit(X_train, y_train)
        preds = grid.predict(X_val)
        
        mse = mean_squared_error(y_val, preds)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_val, preds)
        r2 = r2_score(y_val, preds)
        mape = mean_absolute_percentage_error(y_val, preds) * 100
        
        rmse_minutes = rmse / 60
        mae_minutes = mae / 60
        
        print(f"\n  {name.upper()} Results:")
        print(f"    RMSE: {rmse:.2f}s ({rmse_minutes:.2f} min)")
        print(f"    MAE:  {mae:.2f}s ({mae_minutes:.2f} min)")
        print(f"    MAPE: {mape:.2f}%")
        print(f"    R²:   {r2:.4f}")
        print(f"    Best params: {grid.best_params_}")
        
        results.append({
            "model": name,
            "rmse": rmse,
            "rmse_minutes": rmse_minutes,
            "mae": mae,
            "mae_minutes": mae_minutes,
            "mape": mape,
            "r2": r2,
            "best_params": grid.best_params_
        })
        
        if rmse < best_score:
            best_score = rmse
            best_model = grid.best_estimator_
            best_name = name
    
    model_dir = os.path.join(SCRIPT_DIR, "..", "models")
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, "best_model_eta.pkl")
    feature_order_path = os.path.join(model_dir, "eta_feature_order.pkl")
    
    joblib.dump(best_model, model_path)
    joblib.dump(FEATURE_COLUMNS, feature_order_path)
    
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    
    print("\nBEST MODEL:")
    print(f"  Model: {best_name.upper()}")
    print(f"  RMSE: {best_score:.2f}s ({best_score/60:.2f} minutes)")
    
    best_result = next(r for r in results if r["model"] == best_name)
    print(f"  MAE:  {best_result['mae']:.2f}s ({best_result['mae_minutes']:.2f} minutes)")
    print(f"  MAPE: {best_result['mape']:.2f}%")
    print(f"  R²:   {best_result['r2']:.4f}")
    
    print(f"\nSaved:")
    print(f"  Model: {model_path}")
    print(f"  Features: {feature_order_path}")
    
    print("\nMODEL COMPARISON:")
    print("-" * 90)
    print(f"{'Model':<18} {'RMSE (min)':<12} {'MAE (min)':<12} {'MAPE (%)':<10} {'R²':<8}")
    print("-" * 90)
    for result in sorted(results, key=lambda x: x['rmse']):
        print(f"{result['model']:<18} {result['rmse_minutes']:>10.2f}  "
              f"{result['mae_minutes']:>10.2f}  {result['mape']:>8.2f}  {result['r2']:>6.4f}")
    print("-" * 90)
    
    return {
        "model": best_name,
        "rmse": round(best_score, 2),
        "rmse_minutes": round(best_score / 60, 2),
        "mae": round(best_result['mae'], 2),
        "mae_minutes": round(best_result['mae_minutes'], 2),
        "mape": round(best_result['mape'], 2),
        "r2": round(best_result['r2'], 4),
        "model_path": str(model_path),
        "feature_count": len(FEATURE_COLUMNS),
        "training_samples": len(X_train),
        "validation_samples": len(X_val)
    }

if __name__ == "__main__":
    try:
        results = train_eta_models()
        print("\nTraining completed successfully!")
    except Exception as e:
        print(f"\nError during training: {e}")
        import traceback
        traceback.print_exc()