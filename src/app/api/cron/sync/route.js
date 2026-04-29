import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { scanOrders } from '@/lib/order-scanner';
import { saveOrdersCache, getState } from '@/lib/kv-store';
import { sendPushToAll } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
    const auth = request.headers.get('authorization') || '';
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const log = { startedAt: new Date().toISOString() };
    let scanResult = null;

    try {
        scanResult = await scanOrders();
        await saveOrdersCache(scanResult);
        log.drops = scanResult.drops.length;
    } catch (e) {
        console.error('Cron scan failed:', e);
        log.scanError = e.message;
    }

    try {
        const state = await getState();
        const calendar = readCalendar();
        const fx = await fetchFx();
        const isMonday = new Date().getUTCDay() === 1;
        const payload = buildDigest({ scanResult, state, calendar, fx, weekly: isMonday });
        const r = await sendPushToAll(payload);
        log.pushSent = r.sent;
        log.pushRemoved = r.removed;
        log.pushTotal = r.total;
    } catch (e) {
        console.error('Cron push failed:', e);
        log.pushError = e.message;
    }

    return NextResponse.json(log);
}

function readCalendar() {
    try {
        const filePath = path.join(process.cwd(), 'calendar_data.json');
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return [];
    }
}

async function fetchFx() {
    try {
        const liveRes = await fetch('https://open.er-api.com/v6/latest/USD');
        const liveJson = await liveRes.json();
        const current = liveJson?.rates?.ZAR;

        const today = new Date();
        const past = new Date(today.getTime() - 30 * 86400000);
        const fromStr = past.toISOString().split('T')[0];
        const toStr = today.toISOString().split('T')[0];
        const histRes = await fetch(`https://api.frankfurter.app/${fromStr}..${toStr}?from=USD&to=ZAR`);
        const histJson = await histRes.json();
        const rates = Object.values(histJson?.rates || {})
            .map((r) => r?.ZAR)
            .filter((v) => typeof v === 'number');
        const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : current;

        return { current, avg, favorable: current && avg ? current >= avg : false };
    } catch {
        return null;
    }
}

function computeWealthUSD(scanResult, state) {
    let activeMarketValue = 0;
    for (const drop of scanResult?.drops || []) {
        const soldQty = state.soldAssets?.[drop.name]?.qty || 0;
        const activeQty = drop.totalItems - soldQty;
        if (activeQty <= 0) continue;
        const unitCost = drop.totalItems > 0 ? drop.totalSpend / drop.totalItems : 0;
        const mktVal =
            state.marketValues && state.marketValues[drop.name] !== undefined
                ? state.marketValues[drop.name]
                : unitCost;
        activeMarketValue += activeQty * mktVal;
    }
    return (state.liquidCashUSD || 0) + activeMarketValue;
}

function buildDigest({ scanResult, state, calendar, fx, weekly }) {
    const today = new Date();
    const todayKey = today.toISOString().split('T')[0];

    const todaysDrops = (calendar || []).filter((r) => {
        if (!r.timestamp) return false;
        return new Date(r.timestamp).toISOString().split('T')[0] === todayKey;
    });

    const wealth = computeWealthUSD(scanResult, state);
    const cash = state.liquidCashUSD || 0;

    const lines = [];

    if (todaysDrops.length) {
        lines.push(`Today's drops (${todaysDrops.length}):`);
        for (const d of todaysDrops.slice(0, 4)) {
            lines.push(`• ${d.name} — ${d.type}`);
        }
        if (todaysDrops.length > 4) lines.push(`+ ${todaysDrops.length - 4} more`);
    } else {
        lines.push('No drops today.');
    }

    lines.push('');
    lines.push(`Wealth $${wealth.toFixed(0)} • Cash $${cash.toFixed(0)}`);

    if (fx?.current) {
        const tag = fx.favorable ? ' (favorable)' : '';
        lines.push(`R/$ ${fx.current.toFixed(2)} • 30d avg ${fx.avg.toFixed(2)}${tag}`);
    }

    if (weekly) {
        lines.push('');
        lines.push('--- Week ahead ---');
        const ahead = (calendar || []).filter((r) => {
            if (!r.timestamp) return false;
            const days = (r.timestamp - today.getTime()) / 86400000;
            return days >= 0 && days <= 7;
        });
        lines.push(`${ahead.length} drops in next 7 days`);
        const weekAgo = new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0];
        const wealthAgo = state.wealthHistory?.[weekAgo];
        if (typeof wealthAgo === 'number') {
            const delta = wealth - wealthAgo;
            const sign = delta >= 0 ? '+' : '';
            lines.push(`Δ7d wealth ${sign}$${delta.toFixed(0)}`);
        }
    }

    return {
        title: weekly ? 'RIFT — Weekly Digest' : 'RIFT — Daily',
        body: lines.join('\n'),
        url: '/',
        tag: weekly ? 'rift-weekly' : `rift-daily-${todayKey}`,
    };
}
