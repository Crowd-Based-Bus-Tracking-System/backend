CREATE TABLE IF NOT EXISTS shedules (
    id SERIAL PRIMARY KEY,
    route_id INT REFERENCES routes(id) ON DELETE CASCADE,
    stop_id INT REFERENCES stops(id) ON DELETE CASCADE,
    sheduled_arrival_time TIME NOT NULL,
    day_type VARCHAR(10) DEFAULT 'weekday',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shedules_route_stop ON shedules(route_id, stop_id);