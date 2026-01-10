CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    trip_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);

