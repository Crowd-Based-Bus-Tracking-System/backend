CREATE TABLE IF NOT EXISTS buses (
  id SERIAL PRIMARY KEY,
  bus_number TEXT UNIQUE NOT NULL,
  route_id INT REFERENCES routes(id),
  current_trip_id INT REFERENCES trips(id),
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buses_trip ON buses(current_trip_id);