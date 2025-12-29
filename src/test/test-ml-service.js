import { predictArrival, storeArrivalData, trainArrivalModel, checkMLServiceHealth } from '../services/ml-arrival-confirmation/index.js';

/**
 * Test script to verify FastAPI ML service integration
 */
async function testMLService() {
    console.log('='.repeat(60));
    console.log('Testing FastAPI ML Service Integration');
    console.log('='.repeat(60));

    // Test 1: Check if ML service is available
    console.log('\n1. Checking ML Service Health...');
    const isHealthy = await checkMLServiceHealth();
    console.log(`   ✓ ML Service is ${isHealthy ? 'AVAILABLE' : 'UNAVAILABLE'}`);

    if (!isHealthy) {
        console.log('\n⚠️  ML service is not running. Please start it with:');
        console.log('   cd backend/ml');
        console.log('   uvicorn app:app --reload --port 8000');
        return;
    }

    // Test 2: Test prediction with sample features
    console.log('\n2. Testing Prediction Endpoint...');
    const sampleFeatures = {
        bus_id: 101,
        stop_id: 5,
        arrival_time: Date.now(),
        report_count: 5,
        unique_reporters: 5,
        reports_per_minute: 2.5,
        time_since_last_report_s: 10,
        time_since_first_report_s: 120,
        distance_mean: 15.5,
        distance_median: 12.0,
        distance_std: 8.2,
        pct_within_radius: 0.8,
        acc_mean: 0.75,
        weighted_dist_mean: 14.0,
        prev_arrival_time: Date.now() - 3600000,
        time_since_last_arrival_s: 3600,
        t_mean: Date.now() - 60000,
        t_std: 15000,
        hour_of_day: 9,
        day_of_week: 1,
        is_weekend: 0,
        is_rush_hour: 1,
        is_early_morning: 1,
        is_mid_day: 0,
        is_evening: 0,
        is_night: 0
    };

    try {
        const prediction = await predictArrival(sampleFeatures);
        console.log('   ✓ Prediction received:');
        console.log(`     - Probability: ${(prediction.confirm_probability * 100).toFixed(2)}%`);
        console.log(`     - Confirm: ${prediction.confirm ? 'YES' : 'NO'}`);
    } catch (error) {
        console.log(`   ✗ Prediction failed: ${error.message}`);
    }

    // Test 3: Test storing arrival data with probability
    console.log('\n3. Testing Store Arrival Endpoint...');
    try {
        // Store with the predicted probability
        const prediction = await predictArrival(sampleFeatures);
        const storeResult = await storeArrivalData(sampleFeatures, prediction.confirm_probability);
        console.log(`   ✓ Data stored with probability ${prediction.confirm_probability.toFixed(3)}: ${storeResult.status}`);
    } catch (error) {
        console.log(`   ✗ Store failed: ${error.message}`);
    }

    // Test 4: Test training endpoint (optional - can be slow)
    console.log('\n4. Testing Train Endpoint (optional)...');
    console.log('   ⏭️  Skipping training test (can be slow)');
    console.log('   To test manually, uncomment the code below');

    // Uncomment to test training
    // try {
    //     const trainResult = await trainArrivalModel();
    //     console.log('   ✓ Training completed:');
    //     console.log(`     Metrics: ${JSON.stringify(trainResult)}`);
    // } catch (error) {
    //     console.log(`   ✗ Training failed: ${error.message}`);
    // }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ML Service Integration Test Complete');
    console.log('='.repeat(60));
}

// Run the test
testMLService().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
