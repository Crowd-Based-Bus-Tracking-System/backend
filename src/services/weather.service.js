import axios from 'axios';


const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

export const getWeatherImpact = async (lat, lng) => {
    try {
        if (!OPENWEATHER_API_KEY) {
            console.warn("OPENWEATHER_API_KEY not configured, returning default weather values");
            return getDefaultWeatherImpact();
        }

        const response = await axios.get(OPENWEATHER_BASE_URL, {
            params: {
                lat,
                lon: lng,
                appid: OPENWEATHER_API_KEY,
                units: 'metric'
            },
            timeout: 5000
        });

        const weather = response.data;

        const impactFactors = {
            rain_1h: weather.rain?.['1h'] || 0,
            snow_1h: weather.snow?.['1h'] || 0,

            temperature: weather.main?.temp || 0,
            wind_speed: weather.wind?.speed || 0,

            weather_main: weather.weather?.[0]?.main || 'Unknown',
            weather_description: weather.weather?.[0]?.description || '',

            humidity: weather.main?.humidity || 0,
            visibility: weather.visibility || 10000,
        };

        let delayMultiplier = 1.0;

        if (impactFactors.rain_1h > 5) delayMultiplier += 0.15;
        else if (impactFactors.rain_1h > 2) delayMultiplier += 0.08;

        if (impactFactors.snow_1h > 0) delayMultiplier += 0.30;

        if (impactFactors.temperature < -10) delayMultiplier += 0.10;

        if (impactFactors.visibility < 1000) delayMultiplier += 0.12;

        return {
            factors: impactFactors,
            delayMultiplier,
            rawData: weather
        };

    } catch (error) {
        console.error('Error fetching weather data:', error.message);
        return getDefaultWeatherImpact();
    }
};


const getDefaultWeatherImpact = () => ({
    factors: {
        rain_1h: 0,
        snow_1h: 0,
        temperature: 25,
        wind_speed: 0,
        weather_main: 'Unknown',
        weather_description: '',
        humidity: 50,
        visibility: 10000
    },
    delayMultiplier: 1.0,
    rawData: null
});


export const encodeWeatherCondition = (weatherMain) => {
    const condition = weatherMain?.toLowerCase() || 'unknown';

    return {
        weather_clear: condition === 'clear' ? 1 : 0,
        weather_rain: condition === 'rain' || condition === 'drizzle' ? 1 : 0,
        weather_snow: condition === 'snow' ? 1 : 0,
        weather_fog: condition === 'fog' || condition === 'mist' || condition === 'haze' ? 1 : 0,
        weather_clouds: condition === 'clouds' ? 1 : 0,
        weather_thunderstorm: condition === 'thunderstorm' ? 1 : 0,
        weather_unknown: condition === 'unknown' ? 1 : 0
    };
};
