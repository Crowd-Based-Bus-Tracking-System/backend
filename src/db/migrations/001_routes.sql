CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_city TEXT,
  end_city TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
