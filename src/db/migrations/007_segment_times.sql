CREATE TABLE IF NOT EXISTS segment_times(
    id SERIAL PRIMARY KEY,
    route_id INT REFERENCES routes(id) ON DELETE CASCADE,
    from_stop_id INT REFERENCES stops(id) ON DELETE CASCADE,
    to_stop_id INT REFERENCES stops(id) ON DELETE CASCADE,
    avg_travel_seconds INT NOT NULL,
    stddev_travel_seconds INT,
    sample_count INT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segment_times_route ON segment_times(route_id, from_stop_id);