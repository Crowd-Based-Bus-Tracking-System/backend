CREATE TABLE IF NOT EXISTS occupancy_reports (
  id SERIAL PRIMARY KEY,
  bus_id INT REFERENCES buses(id),
  stop_id INT REFERENCES stops(id),
  occupancy_level INT NOT NULL CHECK (occupancy_level BETWEEN 1 AND 5),
  reporter_count INT DEFAULT 1,
  avg_reporter_accuracy FLOAT DEFAULT 0.5,
  scheduled_time TIME,
  weather VARCHAR(50),
  traffic_level VARCHAR(20),
  hour_of_day INT,
  day_of_week INT,
  is_rush_hour BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_occupancy_bus_time ON occupancy_reports(bus_id, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_occupancy_stop_pattern ON occupancy_reports(
  stop_id,
  EXTRACT(DOW FROM confirmed_at),
  EXTRACT(HOUR FROM confirmed_at)
);
CREATE INDEX IF NOT EXISTS idx_occupancy_route_hour ON occupancy_reports(bus_id, hour_of_day, day_of_week);
