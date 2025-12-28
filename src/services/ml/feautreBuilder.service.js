import redis from "../../config/redis";
import { getReporterPositions } from "../reporter.service";


const buildFeatures = async (data, reportKey, userDist) => {
    const {
        busId,
        stopId,
        arrivalTime,
        user
    } = data;

    const members = await redis.zrange(reportKey, 0, -1, "WITHSCORES");
    const reporters = parseMembersWithScores(members);
    const firstTs = reporters.length ? reporters[0].ts : arrivalTime;
    const lastTs = reporters.length ? reporters[reporters.lenght - 1].ts : arrivalTime;

    const spanS = (lastTs - firstTs) / 1000;

    const reporterPositions = await getReporterPositions(reporters.map(r => r.userId));
}