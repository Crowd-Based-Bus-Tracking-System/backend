import 'dotenv/config';
import pool from './src/config/db.js';

async function main() {
    try {
        // First check actual schema
        const schema = await pool.query(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'segment_times' ORDER BY ordinal_position`
        );
        console.log('segment_times columns:');
        schema.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

        // Extract segment times from schedule data
        const trips = await pool.query(`
            SELECT ts1.stop_id as from_stop, ts1.scheduled_arrival_time as from_time,
                   ts2.stop_id as to_stop, ts2.scheduled_arrival_time as to_time,
                   b.route_id
            FROM trips t
            JOIN trip_schedules ts1 ON ts1.trip_id = t.id
            JOIN trip_schedules ts2 ON ts2.trip_id = t.id AND ts2.stop_sequence = ts1.stop_sequence + 1
            JOIN buses b ON b.id = t.bus_id
            ORDER BY b.route_id, ts1.stop_id
        `);

        const parseTime = (t) => {
            const [h, m, s] = t.split(':').map(Number);
            return h * 3600 + m * 60 + (s || 0);
        };

        const segmentMap = {};
        for (const row of trips.rows) {
            const travel = parseTime(row.to_time) - parseTime(row.from_time);
            if (travel <= 0) continue;
            const key = `${row.route_id}:${row.from_stop}:${row.to_stop}`;
            if (!segmentMap[key]) segmentMap[key] = [];
            segmentMap[key].push(travel);
        }

        // Clear existing and insert fresh data
        await pool.query(`DELETE FROM segment_times`);
        console.log('\nCleared existing segment_times.');

        let count = 0;
        for (const [key, times] of Object.entries(segmentMap)) {
            const [routeId, fromStop, toStop] = key.split(':').map(Number);
            const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

            console.log(`Route ${routeId}: stop ${fromStop} -> ${toStop} = ${avg}s (${(avg / 60).toFixed(1)}m) [${times.length} trips]`);

            // Use only the columns we know exist from schema
            await pool.query(
                `INSERT INTO segment_times (route_id, from_stop_id, to_stop_id, avg_travel_seconds)
                 VALUES ($1, $2, $3, $4)`,
                [routeId, fromStop, toStop, avg]
            );
            count++;
        }

        console.log(`\nInserted ${count} segment times from schedule data.`);

        // Verify
        const final = await pool.query(`SELECT route_id, from_stop_id, to_stop_id, avg_travel_seconds FROM segment_times ORDER BY route_id, from_stop_id`);
        console.log(`\nVerification (${final.rows.length} rows):`);
        final.rows.forEach(r => console.log(`  Route ${r.route_id}: stop ${r.from_stop_id} -> ${r.to_stop_id} = ${r.avg_travel_seconds}s (${(r.avg_travel_seconds / 60).toFixed(1)}m)`));

        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}
main();
