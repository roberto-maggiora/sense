import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

async function main() {
    const queue = new Queue('telemetry_ingest_v1', { connection });
    const counts = await queue.getJobCounts();
    console.log('Job Counts:', counts);

    if (counts.failed > 0) {
        const failed = await queue.getFailed();
        failed.forEach(job => {
            console.log(`Failed Job ${job.id}: ${job.failedReason}`);
        });
    }

    await queue.close();
    connection.disconnect();
}

main().catch(console.error);
