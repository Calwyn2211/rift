import Redis from 'ioredis';

const STATE_KEY = 'rift:state:v1';
const ORDERS_KEY = 'rift:orders:v1';

const DEFAULT_STATE = {
    marketValues: {},
    soldAssets: {},
    simFlips: [],
    wealthHistory: {},
    hiddenItems: [],
    liquidCashUSD: 0,
    currency: 'USD',
};

let cachedClient = null;

function getClient() {
    if (cachedClient) return cachedClient;
    const url = process.env.rift_REDIS_URL || process.env.REDIS_URL || process.env.KV_URL;
    if (!url) return null;
    cachedClient = new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: false,
    });
    cachedClient.on('error', (err) => console.error('Redis error:', err.message));
    return cachedClient;
}

export function isKvConfigured() {
    return getClient() !== null;
}

async function getJson(key) {
    const client = getClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

async function setJson(key, value) {
    const client = getClient();
    if (!client) return;
    await client.set(key, JSON.stringify(value));
}

export async function getState() {
    const stored = await getJson(STATE_KEY);
    return { ...DEFAULT_STATE, ...(stored || {}) };
}

export async function patchState(patch) {
    const current = (await getJson(STATE_KEY)) || {};
    const next = { ...DEFAULT_STATE, ...current, ...patch };
    await setJson(STATE_KEY, next);
    return next;
}

export async function getOrdersCache() {
    return await getJson(ORDERS_KEY);
}

export async function saveOrdersCache(payload) {
    await setJson(ORDERS_KEY, { ...payload, cachedAt: new Date().toISOString() });
}
