INSERT INTO stops(name, location) VALUES
('Stop A - Fort', ST_SetSRID(ST_MakePoint(79.8490, 6.9344), 4326)::geography),
('Stop B - Pettah', ST_SetSRID(ST_MakePoint(79.8570, 6.9360), 4326)::geography),
('Stop C - Maradana', ST_SetSRID(ST_MakePoint(79.8700, 6.9280), 4326)::geography),
('Stop D - Borella', ST_SetSRID(ST_MakePoint(79.8820, 6.9145), 4326)::geography),
('Stop E - Rajagiriya', ST_SetSRID(ST_MakePoint(79.8980, 6.9070), 4326)::geography);

INSERT INTO routes(name, start_stop_id, end_stop_id) VALUES
('100', 'Fort -> Rajagiriya'),
('138', 'Pettah -> Borella');

INSERT INTO route_stops(route_id, stop_id, stop_order)
SELECT 1, id, CASE name
    WHEN 'Stop A - Fort' THEN 1
    WHEN 'Stop B - Pettah' THEN 2
    WHEN 'Stop C - Maradana' THEN 3
    WHEN 'Stop D - Borella' THEN 4
    WHEN 'Stop E - Rajagiriya' THEN 5
END
FROM stops
WHERE name IN ('Stop A - Fort', 'Stop B - Pettah', 'Stop C - Maradana', 'Stop D - Borella', 'Stop E - Rajagiriya');

INSERT INTO route_stops(route_id, stop_id, stop_order)
SELECT 2, id, CASE name
    WHEN 'Stop B - Pettah' THEN 1
    WHEN 'Stop C - Maradana' THEN 2
    WHEN 'Stop D - Borella' THEN 3
END
FROM stops
WHERE name IN ('Stop B - Pettah', 'Stop C - Maradana', 'Stop D - Borella');

INSERT INTO buses(route_id, plate_number, capacity) VALUES
(1, 'NB-1001', 'ACTIVE'),
(1, 'NB-1002', 'ACTIVE'),
(2, 'NB-1381', 'ACTIVE'),
(2, 'NB-1382', 'INACTIVE');
-- bus_number == plate_number