import { predictETAWithML } from "./src/services/ml-eta-prediction/mlEtaIntegration.service.js";
import pool from "./src/config/db.js";
import redis from "./src/config/redis.js";

async function run() {
    try {
        const result = await predictETAWithML({
            bus: { busId: 10, routeId: 5 },
            targetStopId: 24,
            location: { lat: 6.843, lng: 79.919 }
        });
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
        redis.quit();
    }
}
run();
