CREATE TABLE IF NOT EXISTS stops (
  id SERIAL PRIMARY KEY,
  route_id INT REFERENCES routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  sequence INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stops_route_sequence
ON stops(route_id, sequence);
