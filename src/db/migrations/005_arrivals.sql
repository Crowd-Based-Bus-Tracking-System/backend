CREATE TABLE IF NOT EXISTS arrivals (
  id SERIAL PRIMARY KEY,
  bus_id INT REFERENCES buses(id),
  stop_id INT REFERENCES stops(id),
  arrived_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arrivals_bus_time
ON arrivals(bus_id, arrived_at);
