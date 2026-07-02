const { getDatabase } = require('../src/database/db-pool');
const { recordStrategyPredictions } = require('../src/jobs/record-strategy-predictions');

async function main() {
    console.log('Starting strategy predictions...');
    const db = getDatabase();
    const stats = await recordStrategyPredictions(db);
    console.log('Result:', JSON.stringify(stats, null, 2));
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
