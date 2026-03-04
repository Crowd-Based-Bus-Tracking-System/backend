import { getStopById } from "../models/stops.js";
import distanceInMeters from "./geo.js";

export async function checkDistance(stopId, userLat, userLng, RADIUS = 40) {
    try {
        const stopCoordinates = await getStopById(stopId);
        if (!stopCoordinates) {
            console.log("Stop not found");
            return { confirmed: false, error: "Stop not found" };
        }
        console.log("Calculating distance:", { userLat, userLng, stopLat: stopCoordinates.latitude, stopLng: stopCoordinates.longitude });
        const distance = distanceInMeters(
            userLat,
            userLng,
            stopCoordinates.latitude,
            stopCoordinates.longitude
        );
        if (distance > RADIUS) {
            console.log("User is not in the radius");
            return {
                confirmed: false,
                rejected: true,
                reason: "User too far from stop",
                distance
            }
        }
        console.log("User is in the radius", distance);
        return {
            confirmed: true,
            distance
        };
    } catch (error) {
        console.log(error);
        return {
            confirmed: false,
            error: error.message
        };
    }
}