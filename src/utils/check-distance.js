import getStopById from "../services/stop.service";
import distanceInMeters from "./geo";

export async function checkDistance(stopId, userLat, userLng, RADIUS=40) {
    try {
        const stopCoordinates = await getStopById(stopId);
        if (!stopCoordinates) {
            console.log("Stop not found");
            return false;
        }
        const distance = distanceInMeters(
            userLat,
            userLng,
            stopCoordinates.latitude,
            stopCoordinates.longitude,
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
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
}