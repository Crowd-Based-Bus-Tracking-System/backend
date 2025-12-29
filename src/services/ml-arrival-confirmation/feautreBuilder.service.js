import redis from "../../config/redis";
import distanceInMeters from "../../utils/geo";
import { getReporterPositions, getReporterStats } from "../reporter.service";
import { parseMembersWithScores } from "../../utils/helpers";
import { mean, median, stddev, msToSec } from "../../utils/math";

const RADIUS = 100;

const buildFeatures = async (data, reportKey) => {
    const {
        busId,
        stopId,
        arrivalTime,
        user
    } = data;

    const now = Date.now();
    const members = await redis.zrange(reportKey, 0, -1, "WITHSCORES");
    const reporters = parseMembersWithScores(members);
    const firstTs = reporters.length ? reporters[0].ts : arrivalTime;
    const lastTs = reporters.length ? reporters[reporters.length - 1].ts : arrivalTime;

    const spanS = (lastTs - firstTs) / 1000;

    const reporterPositions = await getReporterPositions(reporters.map(r => r.userId));
    const distances = [];
    let withinCount = 0;
    const reporterAccuracyScores = [];
    const reporterDistanceMap = {};

    const statsMap = await Promise.all(reporters.map(r => getReporterStats(r.userId)));
    const accuracyMap = reporters.reduce((acc, reporter, index) => {
        acc[reporter.userId] = parseFloat(statsMap[index]?.accuracy || 0.5);
        return acc;
    }, {});

    for (const reporter of reporters) {
        const pos = reporterPositions.find(p => p.userId === reporter.userId);
        if (pos) {
            const distance = distanceInMeters(pos.lat, pos.lng, user.lat, user.lng);
            if (distance <= RADIUS) withinCount++;
            distances.push(distance);
            reporterDistanceMap[reporter.userId] = distance;
        } else {
            reporterDistanceMap[reporter.userId] = null;
        }
        reporterAccuracyScores.push(accuracyMap[reporter.userId] ?? 0.5);
    }

    const reportCount = reporters.length;
    const uniqueReporters = new Set(reporters.map((r) => r.userId)).size;
    const reportsPerMinute = spanS > 0 ? (reportCount / (spanS / 60)) : reportCount;
    const timeSinceLastReportS = msToSec(now - lastTs);
    const timeSinceFirstReportS = msToSec(now - firstTs);

    const validDistances = distances.filter((d) => d != null);
    const distanceMean = mean(validDistances);
    const distanceMedian = median(validDistances);
    const distanceStd = stddev(validDistances);
    const pctWithinRadius = reporters.length ? withinCount / reporters.length : 0;

    const accMean = mean(reporterAccuracyScores);
    const weightSum = reporterAccuracyScores.reduce((s, x) => s + (x || 0), 0) || 1;
    const weightedDistMean = validDistances.length
        ? validDistances.reduce((s, d, i) => s + d * (reporterAccuracyScores[i] || 0), 0) / weightSum
        : null;

    const prevArrivalKey = `bus:${busId}:lastlast_arrival_time`;
    const prevArrivalKeyTsStr = await redis.get(prevArrivalKey);
    const prevArrivalKeyTs = prevArrivalKeyTsStr ? Number(prevArrivalKeyTsStr) : null;
    const timeSinceLastArrivalS = prevArrivalKeyTs ? msToSec(now - prevArrivalKeyTs) : null;

    const reporterTimestamps = reporters.map((r) => r.ts);
    const tMean = mean(reporterTimestamps);
    const tStd = stddev(reporterTimestamps);

    const arrivalDate = new Date(arrivalTime);
    const hourOfDay = arrivalDate.getHours();
    const dayOfWeek = arrivalDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;

    const isRushHour = ((hourOfDay >= 7 && hourOfDay < 10) || (hourOfDay >= 17 && hourOfDay < 20)) ? 1 : 0;

    const isEarlyMorning = (hourOfDay >= 5 && hourOfDay < 9) ? 1 : 0;
    const isMidDay = (hourOfDay >= 9 && hourOfDay < 17) ? 1 : 0;
    const isEvening = (hourOfDay >= 17 && hourOfDay < 21) ? 1 : 0;
    const isNight = (hourOfDay >= 21 || hourOfDay < 5) ? 1 : 0;

    const features = {
        bus_id: busId,
        stop_id: stopId,
        arrival_time: arrivalTime,
        report_count: reportCount,
        unique_reporters: uniqueReporters,
        reports_per_minute: reportsPerMinute,
        time_since_last_report_s: timeSinceLastReportS,
        time_since_first_report_s: timeSinceFirstReportS,
        distance_mean: distanceMean,
        distance_median: distanceMedian,
        distance_std: distanceStd,
        pct_within_radius: pctWithinRadius,
        acc_mean: accMean,
        weighted_dist_mean: weightedDistMean,
        prev_arrival_time: prevArrivalKeyTs,
        time_since_last_arrival_s: timeSinceLastArrivalS,
        t_mean: tMean,
        t_std: tStd,
        hour_of_day: hourOfDay,
        day_of_week: dayOfWeek,
        is_weekend: isWeekend,
        is_rush_hour: isRushHour,
        is_early_morning: isEarlyMorning,
        is_mid_day: isMidDay,
        is_evening: isEvening,
        is_night: isNight,
    };

    return features;
}

export default buildFeatures;