// import getStopById from "../services/stop.service.js";
import distanceInMeters from "./geo.js";

export async function checkDistance(stopId, userLat, userLng, RADIUS = 40) {
    try {
        // const stopCoordinates = await getStopById(stopId);
        // if (!stopCoordinates) {
        //     console.log("Stop not found");
        //     return false;
        // }
        console.log("Calculating distance:", { userLat, userLng, stopLat: 6.927079, stopLng: 79.861244 });
        const distance = distanceInMeters(
            userLat,
            userLng,
            // stopCoordinates.latitude,
            // stopCoordinates.longitude,
            6.927079,
            79.861244
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