import { parse } from "dotenv";
import redis from "../config/redis";

export const storeReporterPosition = async (data) => {
    const {
        busId,
        stopId,
        arrivalTime,
        user
    } = data;

    const key = `reporter:${user.id}:pos`;

    await redis.hset(key, {
        lat: String(user.lat),
        lng: String(user.lng),
        ts: String(arrivalTime),
    });

    await redis.expire(key, 60 * 60);
    return { userId: user.id, userLat: user.lat, userLng: user.lng, arrivalTime };
}


export const getReporterPosition = async (userId) => {
    return redis.hgetall(`reporter:${userId}:pos`);
}


export const getReporterPositions = async (userIds = []) => {
    const arr = await Promise.all(
        userIds.map(id => redis.hgetall(`reporter:${id}:pos`))
    )
    return userIds.map((id, i) => ({ userId: id, ...arr[i] }));
}


export const increaseReporterStatsOnConfirm = async (userId) => {
    const statKey = `reporter:${userId}:stats`;
    await redis.hincrby(statKey, "total_reports", 1);
    await redis.hincrby(statKey, "confirmed_reports", 1);

    const values = await redis.hgetall(statKey);
    const total = parseInt(values.total_reports || "0", 10);
    const confirmed = parseInt(values.confirmed_reports || "0", 10);

    const accuracy = total === 0 ? 0 : (confirmed / total);
    await redis.hset(statKey, "accuracy", String(accuracy));
}


export const increaseReporterStatsOnReport = async (userId) => {
    const statKey = `reporter:${userId}:stats`;
    await redis.hincrby(statKey, "total_reports", 1);

    const values = await redis.hgetall(statKey);
    const total = parseInt(values.total_reports || "0", 10);
    const confirmed = parseInt(values.confirmed_reports || "0", 10);

    const accuracy = total === 0 ? 0 : (confirmed / total);
    await redis.hset(statKey, "accuracy", String(accuracy));
}


export const getReporterStats = async (userId) => {
    return redis.hgetall(`reporter:${userId}:stats`);
}
