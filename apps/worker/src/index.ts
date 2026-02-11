import Redis from 'ioredis';
import { CONTRACT_VERSION } from '@sense/contracts';

console.log(`Worker started. Contracts version: ${CONTRACT_VERSION}`);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connectRedis = async () => {
    const redis = new Redis(redisUrl, {
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            console.log(`Retrying Redis connection in ${delay}ms...`);
            return delay;
        },
        lazyConnect: true // waiting for manual connect to catch error
    });

    redis.on('error', (err) => {
        // Suppress unhandled error logs from ioredis default handler to avoid noise if we are handling it
        // console.error('Redis error event:', err.message);
    });

    try {
        await redis.connect();
        console.log('Connected to Redis!');

        // Ping loop
        setInterval(async () => {
            try {
                const res = await redis.ping();
                console.log(`Redis PING: ${res}`);
            } catch (err) {
                console.error('Redis PING failed:', err);
            }
        }, 5000);

    } catch (err) {
        console.error('Failed to connect to Redis, retrying in 5s...', err);
        setTimeout(connectRedis, 5000);
    }
};

connectRedis();
