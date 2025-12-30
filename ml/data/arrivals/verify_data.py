import pandas as pd

df = pd.read_csv('arrivals.csv')

print(f'Shape: {df.shape}')
print(f'\nFirst 5 rows (selected columns):')
print(df[['bus_id', 'stop_id', 'report_count', 'distance_mean', 'pct_within_radius', 'confirm_prob']].head())
print(f'\nconfirm_prob statistics:')
print(df['confirm_prob'].describe())
print(f'\nconfirm_prob dtype: {df["confirm_prob"].dtype}')
print(f'\nAll columns:')
print(df.columns.tolist())
