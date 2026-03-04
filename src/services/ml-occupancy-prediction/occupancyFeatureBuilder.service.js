import redis from "../../config/redis.js";
import distanceInMeters from "../../utils/geo.js";
import { getReporterPositions, getReporterStats } from "../reporter.service.js";
import { parseMembersWithScores } from "../../utils/helpers.js";
import { mean, median, stddev } from "../../utils/math.js";
import { getWeatherImpact, encodeWeatherCondition } from "../weather.service.js";
import { getAverageOccupancyByHourAndStop, getRecentOccupancyForBus } from "../../models/occupancy.js";

const RADIUS = 20;

const buildOccupancyFeatures = async (data, reportKey) => {
    const {
        bus: { busId, routeId },
        stopId,
        occupancyLevel,
        reportTime,
        user
    } = data;

    const now = Math.floor(Date.now() / 1000);
    const reportTimestamp = reportTime || now;

    let reportCount = 0;
    let uniqueReporters = 0;
    let reportsPerMinute = 0;
    let timeSinceLastReportS = 0;
    let timeSinceFirstReportS = 0;
    let distanceMean = 0;
    let distanceMedian = 0;
    let distanceStd = 0;
    let pctWithinRadius = 0;
    let accMean = 0.5;
    let weightedDistMean = 0;
    let tMean = reportTimestamp;
    let tStd = 0;
    let reportedLevels = [];

    if (reportKey) {
        const members = await redis.zrange(reportKey, 0, -1, "WITHSCORES");
        const reporters = parseMembersWithScores(members);

        const firstTs = reporters.length ? reporters[0].ts : reportTimestamp;
        const lastTs = reporters.length ? reporters[reporters.length - 1].ts : reportTimestamp;
        const spanS = lastTs - firstTs;

        const reporterUserIds = reporters.map(r => r.userId.split(":")[0]);
        reportedLevels = reporters.map(r => {
            const parts = r.userId.split(":");
            return parts.length > 1 ? parseInt(parts[1]) : (occupancyLevel || 3);
        });

        const reporterPositions = await getReporterPositions(reporterUserIds);
        const distances = [];
        let withinCount = 0;
        const reporterAccuracyScores = [];

        const statsMap = await Promise.all(reporterUserIds.map(id => getReporterStats(id)));
        const accuracyMap = reporterUserIds.reduce((acc, id, index) => {
            acc[id] = parseFloat(statsMap[index]?.accuracy || 0.5);
            return acc;
        }, {});

        for (let i = 0; i < reporterUserIds.length; i++) {
            const pos = reporterPositions.find(p => p.userId === reporterUserIds[i]);
            if (pos && user) {
                const distance = distanceInMeters(pos.lat, pos.lng, user.lat, user.lng);
                if (distance <= RADIUS) {
                    withinCount++;
                    distances.push(distance);
                    reporterAccuracyScores.push(accuracyMap[reporterUserIds[i]] ?? 0.5);
                }
            }
        }

        reportCount = reporters.length;
        uniqueReporters = new Set(reporterUserIds).size;
        reportsPerMinute = spanS > 0 ? (reportCount / (spanS / 60)) : reportCount;
        timeSinceLastReportS = Math.max(0, now - lastTs);
        timeSinceFirstReportS = Math.max(0, now - firstTs);

        distanceMean = mean(distances) || 0;
        distanceMedian = median(distances) || 0;
        distanceStd = stddev(distances) || 0;
        pctWithinRadius = reporters.length ? withinCount / reporters.length : 0;

        accMean = mean(reporterAccuracyScores) || 0.5;
        const weightSum = reporterAccuracyScores.reduce((s, x) => s + (x || 0), 0) || 1;
        weightedDistMean = distances.length
            ? distances.reduce((s, d, i) => s + d * (reporterAccuracyScores[i] || 0), 0) / weightSum
            : 0;

        const reporterTimestamps = reporters.map(r => r.ts);
        tMean = mean(reporterTimestamps) || reportTimestamp;
        tStd = stddev(reporterTimestamps) || 0;
    }

    const reportDate = new Date(reportTimestamp * 1000);
    const hourOfDay = data.hourOfDay ?? reportDate.getHours();
    const dayOfWeek = data.dayOfWeek ?? reportDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
    const isRushHour = ((hourOfDay >= 7 && hourOfDay < 10) || (hourOfDay >= 17 && hourOfDay < 20)) ? 1 : 0;
    const isEarlyMorning = (hourOfDay >= 5 && hourOfDay < 9) ? 1 : 0;
    const isMidDay = (hourOfDay >= 9 && hourOfDay < 17) ? 1 : 0;
    const isEvening = (hourOfDay >= 17 && hourOfDay < 21) ? 1 : 0;
    const isNight = (hourOfDay >= 21 || hourOfDay < 5) ? 1 : 0;

    let historicalAvgOccupancy = 3;
    let historicalSampleCount = 0;
    try {
        const hist = await getAverageOccupancyByHourAndStop(stopId, hourOfDay, dayOfWeek);
        if (hist?.avg_occupancy) {
            historicalAvgOccupancy = parseFloat(hist.avg_occupancy);
            historicalSampleCount = parseInt(hist.sample_count);
        }
    } catch (e) { /* ignore */ }

    let recentOccupancyLevel = 0;
    let hasRecentOccupancy = 0;
    try {
        const recent = await getRecentOccupancyForBus(busId, 120);
        if (recent.length > 0) {
            recentOccupancyLevel = recent[0].occupancy_level;
            hasRecentOccupancy = 1;
        }
    } catch (e) { /* ignore */ }

    const levelMean = reportedLevels.length > 0 ? mean(reportedLevels) : (occupancyLevel || 3);
    const levelStd = reportedLevels.length > 1 ? stddev(reportedLevels) : 0;

    let weatherFeatures = {
        rain_1h: 0, snow_1h: 0, temperature: 25,
        wind_speed: 0, humidity: 50, visibility: 10000,
        weather_delay_multiplier: 1.0,
        weather_clear: 1, weather_rain: 0, weather_snow: 0,
        weather_fog: 0, weather_clouds: 0, weather_thunderstorm: 0, weather_unknown: 0
    };

    if (user?.lat && user?.lng) {
        try {
            const weatherImpact = await getWeatherImpact(user.lat, user.lng);
            const weatherEncoded = encodeWeatherCondition(weatherImpact.factors.weather_main);
            weatherFeatures = {
                rain_1h: weatherImpact.factors.rain_1h,
                snow_1h: weatherImpact.factors.snow_1h,
                temperature: weatherImpact.factors.temperature,
                wind_speed: weatherImpact.factors.wind_speed,
                humidity: weatherImpact.factors.humidity,
                visibility: weatherImpact.factors.visibility,
                weather_delay_multiplier: weatherImpact.delayMultiplier,
                ...weatherEncoded
            };
        } catch (e) {  }
    }

    return {
        bus_id: busId,
        stop_id: stopId,
        route_id: routeId || 0,
        report_time: reportTimestamp,
        occupancy_level_reported: occupancyLevel || 0,

        report_count: reportCount,
        unique_reporters: uniqueReporters,
        reports_per_minute: reportsPerMinute,
        time_since_last_report_s: timeSinceLastReportS,
        time_since_first_report_s: timeSinceFirstReportS,

        distance_mean: distanceMean,
        distance_median: distanceMedian,
        distance_std: distanceStd,
        pct_within_radius: pctWithinRadius,
        weighted_dist_mean: weightedDistMean,
        acc_mean: accMean,

        occupancy_level_mean: levelMean,
        occupancy_level_std: levelStd,

        t_mean: tMean,
        t_std: tStd,

        historical_avg_occupancy: historicalAvgOccupancy,
        historical_sample_count: historicalSampleCount,
        recent_occupancy_level: recentOccupancyLevel,
        has_recent_occupancy: hasRecentOccupancy,

        hour_of_day: hourOfDay,
        day_of_week: dayOfWeek,
        is_weekend: isWeekend,
        is_rush_hour: isRushHour,
        is_early_morning: isEarlyMorning,
        is_mid_day: isMidDay,
        is_evening: isEvening,
        is_night: isNight,

        ...weatherFeatures
    };
};

export default buildOccupancyFeatures;
