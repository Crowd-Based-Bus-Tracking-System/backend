CREATE EXTENSION IF NOT EXIST postgis;

CREATE TABLE IF NOT EXIST stops (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL
);

CREATE TABLE IF NOT EXIST routes (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_stops (
  route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id INT NOT NULL REFERENCES stops(id) ON DELETE CASCADE, 
  stop_order INT NOT NULL,
  PRIMARY KEY (route_id, stop_id)
);

CREATE TABLE IF NOT EXISTS buses (
  id SERIAL PRIMARY KEY,
  route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  bus_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stops_location ON stops USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_route_stops_route_order ON route_stops(route_id, stop_order);