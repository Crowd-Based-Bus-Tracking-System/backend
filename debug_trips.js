import dotenv from 'dotenv';
dotenv.config();
import pool from './src/config/db.js';
import { getActiveOrNextTripForBus } from './src/models/shedule.js';
import fs from 'fs';

const tripData = await getActiveOrNextTripForBus(1);
const now = new Date();
const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

let output = 'Current time: ' + now.toLocaleTimeString() + ' (' + currentSeconds + 's)\n\n';

if (tripData.activeTrip) {
    const trip = tripData.activeTrip;
    output += 'ACTIVE TRIP FOUND: id=' + trip.id + '\n';
    output += 'startSecs=' + trip.startSecs + ' endSecs=' + trip.endSecs + '\n';
    output += 'normalizedCurrentSeconds=' + trip.normalizedCurrentSeconds + '\n\n';
    output += 'Stop schedule (normalized):\n';
    for (const stop of trip.stops) {
        const normalizedCurrent = trip.normalizedCurrentSeconds;
        const stopSecs = stop.tMs / 1000;
        const diff = stopSecs - normalizedCurrent;
        const passed = normalizedCurrent > stopSecs;
        output += '  Stop ' + stop.stop_id + ': tMs=' + stop.tMs + ' secs=' + stopSecs + ' diff=' + diff + 's' + (passed ? ' [PASSED]' : ' [AHEAD]') + '\n';
    }
} else {
    output += 'NO ACTIVE TRIP! nextTrip=' + (tripData.nextTrip ? tripData.nextTrip.id : 'null') + '\n';
}

fs.writeFileSync('debug_output.txt', output);
console.log('Written to debug_output.txt');
process.exit();
