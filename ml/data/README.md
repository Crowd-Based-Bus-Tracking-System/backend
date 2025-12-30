# Bus Arrival Training Data - Summary

## Generated Files

### 1. `arrivals.csv`
- **Rows**: 150
- **Columns**: 27
- **Purpose**: Training data for bus arrival prediction regression model

## Features

### Identifiers
- `bus_id`: Bus identifier (1-10)
- `stop_id`: Stop identifier (1-20)
- `arrival_time`: Unix timestamp of arrival

### Report Metrics
- `report_count`: Number of reports (1-24)
- `unique_reporters`: Number of unique reporters
- `reports_per_minute`: Rate of reports
- `time_since_last_report_s`: Seconds since last report
- `time_since_first_report_s`: Seconds since first report

### Distance Metrics (in meters)
- `distance_mean`: Average distance from stop
- `distance_median`: Median distance from stop
- `distance_std`: Standard deviation of distances
- `pct_within_radius`: Percentage of reports within acceptable radius (0.0-1.0)
- `acc_mean`: Mean GPS accuracy
- `weighted_dist_mean`: Distance weighted by accuracy

### Previous Arrival Data
- `prev_arrival_time`: Previous arrival timestamp
- `time_since_last_arrival_s`: Seconds since last arrival

### Time Statistics
- `t_mean`: Mean time value
- `t_std`: Standard deviation of time

### Time-Based Features
- `hour_of_day`: Hour (0-23)
- `day_of_week`: Day of week (0-6, Monday=0)
- `is_weekend`: Binary (1 if weekend)
- `is_rush_hour`: Binary (1 if 7-9 AM or 5-7 PM)
- `is_early_morning`: Binary (1 if 5-9 AM)
- `is_mid_day`: Binary (1 if 9 AM-5 PM)
- `is_evening`: Binary (1 if 5-9 PM)
- `is_night`: Binary (1 if 9 PM-5 AM)

### Target Variable
- `confirm_prob`: **Continuous probability value (0.0 - 1.0)** for regression
  - Calculated based on:
    - Report count (30% weight)
    - Distance from stop (25% weight)
    - Percentage within radius (25% weight)
    - Rush hour indicator (10% weight)
    - Unique reporter ratio (10% weight)
  - Includes random noise for realism
  - Clipped to [0.0, 1.0] range

## Model Training Updates

The `train_arrival.py` script has been updated for **regression** (not classification):

### Models Included
1. **Linear Regression**: Baseline linear model
2. **Ridge Regression**: L2 regularization (alpha: 0.1, 1, 10)
3. **Random Forest Regressor**: Ensemble model
4. **Gradient Boosting Regressor**: Boosted ensemble
5. **SVR**: Support Vector Regression

### Evaluation Metrics
- **RMSE** (Root Mean Squared Error): Primary metric for model selection
- **MAE** (Mean Absolute Error): Interpretable error metric
- **R²** (R-squared): Coefficient of determination

### Output
- Best model saved to: `models/best_model_arrival.pkl`
- Model selected based on lowest RMSE on validation set

## Data Distribution
- Balanced probability distribution across 0.0-1.0 range
- Realistic correlations between features
- 80/20 train/validation split

## Next Steps
To train the model, run:
```bash
cd backend/ml/training
python train_arrival.py
```
