CREATE TABLE IF NOT EXISTS trip_schedules (
    id SERIAL PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    stop_id INT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    scheduled_arrival_time TIME NOT NULL,
    stop_sequence INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(trip_id, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_schedules_trip ON trip_schedules(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_schedules_stop ON trip_schedules(stop_id);

