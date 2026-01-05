import redis from "../../config/redis.js";
import pool from "../../config/db.js";
import BusProgressionService from "../busProgression.service.js";
import BaseEtaService from "../eta.service.js";
import { getScheduleForStop } from "../../models/shedule.js";
import { getRouteStops } from "../../models/route.js";
import { mean, median, stddev } from "../../utils/math.js";
import { getWeatherImpact, encodeWeatherCondition } from "../weather.service.js";
import { getAverageDelayByHour, getAverageDelayToday, getDelaySByHourandDOW, getDelayTrend, getRecent7dArrivals, getStopDelays } from "../../models/arrival.js";

const busProgressionService = new BusProgressionService();
const baseEtaService = new BaseEtaService();

const buildETAFeatures = async ({ busId, targetStopId, requestTime, location }) => {
    const now = requestTime || Date.now();

    const lastCheckpoint = await busProgressionService.getLastConfirmedStop(busId);

    const targetSchedule = await getScheduleForStop(busId, targetStopId);

    const remainingStops = await busProgressionService.getRemainingStops(busId, targetStopId);

    const segmentFeatures = await calculateSegmentFeatures(
        busId,
        lastCheckpoint?.stopId,
        targetStopId,
        remainingStops
    );

    const delayFeatures = await calculateDelayFeatures(busId, lastCheckpoint, targetSchedule, now);

    const contextFeatures = await getContextualFeatures(location, now);

    const freshnessFeatures = calculateFreshnessFeatures(
        lastCheckpoint,
        now,
        segmentFeatures.avg_segment_time_remaining
    );

    const historicalFeatures = await getHistoricalPerformance(
        busId,
        targetStopId,
        now
    );

    const routeFeatures = calculateRouteFeatures(remainingStops, lastCheckpoint);

    const reporterFeatures = await getReporterFeatures(targetStopId);

    const timeFeatures = calculateTimeFeatures(now);

    return {
        bus_id: busId,
        target_stop_id: targetStopId,
        prediction_made_at: now,

        ...delayFeatures,

        ...routeFeatures,
        ...segmentFeatures,

        ...freshnessFeatures,

        ...historicalFeatures,

        ...timeFeatures,

        ...contextFeatures,

        ...reporterFeatures
    };
};


async function calculateDelayFeatures(busId, lastCheckpoint, targetSchedule, now) {
    const features = {
        scheduled_arrival_time: null,
        seconds_until_scheduled: null,
        current_delay_seconds: 0,
        delay_at_last_stop: 0,
        avg_delay_this_route_today: 0,
        avg_delay_same_hour: 0,
        schedule_adherence_score: 0.5,
        delay_trend_last_3_stops: 0,
        is_delay_accelerating: 0,
        delay_per_stop_rate: 0
    };

    if (targetSchedule) {
        const scheduledTime = baseEtaService.getScheduledTime(targetSchedule);
        features.scheduled_arrival_time = scheduledTime;
        features.seconds_until_scheduled = (scheduledTime - now) / 1000;
    }

    if (lastCheckpoint) {
        const lastSchedule = await getScheduleForStop(busId, lastCheckpoint.stopId);
        if (lastSchedule) {
            const scheduledTime = baseEtaService.getScheduledTime(lastSchedule);
            features.current_delay_seconds = (lastCheckpoint.arrivedAt - scheduledTime) / 1000;
            features.delay_at_last_stop = features.current_delay_seconds;
        }
    }

    const routeDelayToday = await getAverageDelayToday(busId);
    features.avg_delay_this_route_today = routeDelayToday;

    const hour = new Date(now).getHours();
    const avgDelayHour = await getAverageDelayByHour(busId, targetStopId, hour);
    features.avg_delay_same_hour = avgDelayHour;

    if (routeDelayToday !== null) {
        const maxAcceptableDelay = 300;
        features.schedule_adherence_score = Math.max(0, 1 - Math.abs(routeDelayToday) / maxAcceptableDelay);
    }

    const delayTrend = await calculateDelayTrend(busId);
    features.delay_trend_last_3_stops = delayTrend.trend;
    features.is_delay_accelerating = delayTrend.accelerating ? 1 : 0;
    features.delay_per_stop_rate = delayTrend.perStopRate;

    return features;
}


async function calculateSegmentFeatures(fromStopId, remainingStops) {
    const features = {
        total_segment_time_remaining: 0,
        avg_segment_time_remaining: 0,
        stddev_segment_time: 0,
        min_segment_time: 0,
        max_segment_time: 0,
        segment_time_variance: 0
    };

    if (remainingStops.length === 0) {
        return features;
    }

    const segmentTimes = [];
    let totalTime = 0;
    let currentFromId = fromStopId;

    for (const stop of remainingStops) {
        const segmentTime = await baseEtaService.getSegmentTime(currentFromId || stop.id, stop.id);
        segmentTimes.push(segmentTime);
        totalTime += segmentTime;
        currentFromId = stop.id;
    }

    features.total_segment_time_remaining = totalTime;
    features.avg_segment_time_remaining = mean(segmentTimes) || 0;
    features.stddev_segment_time = stddev(segmentTimes) || 0;
    features.min_segment_time = Math.min(...segmentTimes) || 0;
    features.max_segment_time = Math.max(...segmentTimes) || 0;
    features.segment_time_variance = features.stddev_segment_time ** 2;
}

function calculateFreshnessFeatures(lastCheckpoint, now, avgSegmentTime = 300) {
    const features = {
        minutes_since_last_checkpoint: null,
        checkpoint_freshness_score: 0,
        checkpoint_age_penalty: 2.0,
        has_recent_checkpoint: 0,
        stops_since_last_checkpoint: 0,
        time_to_next_expected_report: null,
        checkpoint_reliability_score: 0.5
    };

    if (!lastCheckpoint) {
        return features;
    }

    const timeSinceMs = now - lastCheckpoint.arrivedAt;
    const minutesSince = timeSinceMs / 60000;

    const freshness = Math.exp(-minutesSince / 10);

    const agePenalty = 1 + (minutesSince / 30);

    const avgSegmentMinutes = avgSegmentTime / 60;
    const estimatedStopsPassed = avgSegmentMinutes > 0
        ? Math.floor(minutesSince / avgSegmentMinutes)
        : Math.floor(minutesSince / 5);

    const nextReportIn = Math.max(0, avgSegmentTime - (timeSinceMs / 1000));

    features.minutes_since_last_checkpoint = minutesSince;
    features.checkpoint_freshness_score = freshness;
    features.checkpoint_age_penalty = agePenalty;
    features.has_recent_checkpoint = minutesSince < 10 ? 1 : 0;
    features.stops_since_last_checkpoint = estimatedStopsPassed;
    features.time_to_next_expected_report = nextReportIn;
    features.checkpoint_reliability_score = freshness;

    return features;
}


async function getHistoricalPerformance(busId, stopId, now) {
    const date = new Date(now);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();

    const features = {
        historical_delay_avg: 0,
        historical_delay_p50: 0,
        historical_delay_p90: 0,
        same_day_hour_avg_delay: 0,
        recent_24h_performance: 0.5,
        recent_7d_performance: 0.5,
        route_punctuality_score: 0.5,
        historical_completion_rate: 0.9,
        typical_delay_this_stop: 0,
        historical_sample_count: 0
    };

    try {
        const result = await getDelaySByHourandDOW(stopId, hour, dayOfWeek);

        if (result.rows.length > 0) {
            const delays = result.rows.map(r => r.delay_seconds || 0).sort((a, b) => a - b);

            features.historical_delay_avg = mean(delays) || 0;
            features.historical_delay_p50 = delays[Math.floor(delays.length * 0.5)] || 0;
            features.historical_delay_p90 = delays[Math.floor(delays.length * 0.9)] || 0;
            features.same_day_hour_avg_delay = features.historical_delay_avg;
            features.historical_sample_count = delays.length;
        }

        const recent24h = await getRecent24hArrivals(busId);

        if (recent24h.rows[0]?.total_count > 0) {
            features.recent_24h_performance = recent24h.rows[0].on_time_count / recent24h.rows[0].total_count;
        }

        const recent7d = await getRecent7dArrivals(busId);

        if (recent7d.rows[0]?.total_count > 0) {
            features.recent_7d_performance = recent7d.rows[0].on_time_count / recent7d.rows[0].total_count;
            features.route_punctuality_score = features.recent_7d_performance;
        }

        const stopDelay = await getStopDelays(stopId);

        if (stopDelay.rows[0]?.avg_delay !== null) {
            features.typical_delay_this_stop = stopDelay.rows[0].avg_delay;
        }

    } catch (error) {
        console.error("Error fetching historical performance:", error);
    }

    return features;
}


function calculateRouteFeatures(remainingStops, lastCheckpoint) {
    const totalStops = remainingStops.length;

    return {
        stops_remaining: totalStops,
        pct_route_completed: lastCheckpoint ? 0.5 : 0,
        distance_remaining_km: totalStops * 0.5
    };
}


async function getReporterFeatures(targetStopId) {
    const features = {
        reporters_at_target_stop: 0,
        avg_reporter_accuracy_target: 0.5,
        recent_report_density: 0,
        report_consensus_strength: 0,
        has_high_quality_reporter: 0,
        reporter_cluster_tightness: 0
    };

    try {
        const reportKey = `stop:${targetStopId}:watchers`;
        const watchers = await redis.zcard(reportKey);
        features.reporters_at_target_stop = watchers || 0;

        if (watchers > 0) {
            const watcherIds = await redis.zrange(reportKey, 0, -1);

            const { getReporterStats } = await import('../reporter.service.js');
            const reporterStats = await Promise.all(
                watcherIds.map(id => getReporterStats(id))
            );

            const accuracies = reporterStats
                .map(stats => parseFloat(stats?.accuracy || 0))
                .filter(acc => acc > 0);

            if (accuracies.length > 0) {
                features.avg_reporter_accuracy_target =
                    accuracies.length > 0
                        ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
                        : 0;
                features.has_high_quality_reporter = accuracies.some(acc => acc > 0.9) ? 1 : 0;
            }
        }
    } catch (error) {
        console.error("Error fetching reporter features:", error);
    }

    return features;
}


async function getContextualFeatures(location, now) {
    const features = {
        temperature: 20,
        rain_1h: 0,
        snow_1h: 0,
        weather_condition_encoded: 0,
        visibility: 10000,
        wind_speed: 0,
        humidity: 50,
        weather_delay_multiplier: 1.0,
        traffic_level_encoded: 0,
        is_holiday: 0,
        is_special_event: 0
    };


    if (location?.lat && location?.lng) {
        try {
            const weatherImpact = await getWeatherImpact(location.lat, location.lng);
            const weatherEncoded = encodeWeatherCondition(weatherImpact.factors.weather_main);

            features.temperature = weatherImpact.factors.temperature;
            features.rain_1h = weatherImpact.factors.rain_1h;
            features.snow_1h = weatherImpact.factors.snow_1h;
            features.visibility = weatherImpact.factors.visibility;
            features.wind_speed = weatherImpact.factors.wind_speed;
            features.humidity = weatherImpact.factors.humidity;
            features.weather_delay_multiplier = weatherImpact.delayMultiplier;
            Object.assign(features, weatherEncoded);
        } catch (error) {
            console.error("Error fetching weather:", error);
        }
    }


    const date = new Date(now);
    const month = date.getMonth();
    const day = date.getDate();

    const holidays = [
        { month: 11, day: 25 },
        { month: 0, day: 1 }
    ];

    features.is_holiday = holidays.some(
        h => h.month === month && h.day === day
    ) ? 1 : 0;

    return features;
}

function calculateTimeFeatures(now) {
    const date = new Date(now);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isRushHour = (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20);
    const isPeakPeriod = (hour >= 7 && hour < 20) && !isWeekend;

    let minutesIntoRushHour = 0;
    if (hour >= 7 && hour < 10) {
        minutesIntoRushHour = (hour - 7) * 60 + date.getMinutes();
    } else if (hour >= 17 && hour < 20) {
        minutesIntoRushHour = (hour - 17) * 60 + date.getMinutes();
    }

    return {
        hour_of_day: hour,
        day_of_week: dayOfWeek,
        is_weekend: isWeekend ? 1 : 0,
        is_rush_hour: isRushHour ? 1 : 0,
        is_peak_period: isPeakPeriod ? 1 : 0,
        minutes_into_rush_hour: minutesIntoRushHour
    };
}

async function calculateDelayTrend(busId) {
    try {
        const result = await getDelayTrend(busId);

        if (result.rows.length < 2) {
            return { trend: 0, accelerating: false, perStopRate: 0 };
        }

        const delays = result.rows.map(r => r.delay_seconds ?? 0).reverse();

        const trend = delays[delays.length - 1] - delays[0];

        const accelerating = trend > 0;

        const perStopRate = delays.length > 1 ? trend / (delays.length - 1) : 0;

        return { trend, accelerating, perStopRate };
    } catch (error) {
        console.error("Error calculating delay trend:", error);
        return { trend: 0, accelerating: false, perStopRate: 0 };
    }
}

export default buildETAFeatures;
