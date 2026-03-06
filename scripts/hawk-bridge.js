const mqtt = require('mqtt');
const fs = require('fs');

const {
    EMQX_HOST,
    EMQX_PORT,
    EMQX_USERNAME,
    EMQX_PASSWORD,
    EMQX_CA_FILE,
    TOPICS,
    SENSE_INGEST_URL,
    SENSE_INGEST_KEY
} = process.env;

if (!EMQX_HOST || !EMQX_PORT || !TOPICS || !SENSE_INGEST_URL || !SENSE_INGEST_KEY) {
    console.error('errors', new Error('Missing required environment variables'));
    process.exit(1);
}

const protocol = EMQX_PORT == '8883' ? 'mqtts' : 'mqtt';

const options = {
    host: EMQX_HOST,
    port: parseInt(EMQX_PORT, 10),
    protocol: protocol,
    username: EMQX_USERNAME,
    password: EMQX_PASSWORD,
    rejectUnauthorized: false
};

if (EMQX_CA_FILE && fs.existsSync(EMQX_CA_FILE)) {
    options.ca = fs.readFileSync(EMQX_CA_FILE);
    options.rejectUnauthorized = true;
}

const client = mqtt.connect(options);

client.on('connect', () => {
    console.log('connected');
    const topicsArray = TOPICS.split(',').map(t => t.trim()).filter(Boolean);
    client.subscribe(topicsArray, (err) => {
        if (!err) {
            console.log('subscribed');
        } else {
            console.error('errors', err);
        }
    });
});

client.on('message', async (topic, message) => {
    try {
        const payloadString = message.toString();
        let payloadParsed = payloadString;
        try {
            payloadParsed = JSON.parse(payloadString);
        } catch (e) {
            // keep as string if not JSON
        }

        const body = {
            topic: topic,
            payload: payloadParsed
        };

        const res = await fetch(SENSE_INGEST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-ingest-key': SENSE_INGEST_KEY
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${res.statusText} ${errText}`);
        }

        if (topic.includes('heartbeat')) {
            console.log('forwarded heartbeat');
        } else if (topic.includes('sensors')) {
            console.log('forwarded sensors');
        } else {
            console.log(`forwarded ${topic}`);
        }
    } catch (err) {
        console.error('errors', err);
    }
});

client.on('error', (err) => {
    console.error('errors', err);
});
