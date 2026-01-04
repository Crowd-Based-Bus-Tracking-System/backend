CREATE TABLE IF NOT EXISTS arrivals (
  id SERIAL PRIMARY KEY,
  bus_id INT REFERENCES buses(id),
  stop_id INT REFERENCES stops(id),
  scheduled_time TIME,
  delay_seconds INT,
  weather VARCHAR(50),
  traffic_level VARCHAR(20),
  event_nearby BOOLEAN DEFAULT FALSE,
  arrived_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arrivals_bus_time ON arrivals(bus_id, arrived_at);
CREATE INDEX IF NOT EXISTS idx_arrivals_delay ON arrivals(bus_id, delay_seconds);
CREATE INDEX IF NOT EXISTS idx_arrivals_time_pattern ON arrivals(
  stop_id,
  EXTRACT(DOW FROM arrived_at),
  EXTRACT(HOUR FROM arrived_at)
)
