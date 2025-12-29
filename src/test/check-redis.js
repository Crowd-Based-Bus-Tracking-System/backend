import "dotenv/config";
import redis from "../config/redis.js";

async function checkKeys() {
    try {
        const keys = await redis.keys("*");
        console.log("All Redis keys:", keys);

        for (const key of keys) {
            const type = await redis.type(key);
            console.log(`\nKey: ${key}, Type: ${type}`);

            if (type === "string") {
                const value = await redis.get(key);
                console.log(`  Value: ${value}`);
            } else if (type === "zset") {
                const members = await redis.zrange(key, 0, -1, "WITHSCORES");
                console.log(`  Members:`, members);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

checkKeys();
