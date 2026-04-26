import { NextResponse } from 'next/server';
import { scanOrders } from '@/lib/order-scanner';
import { saveOrdersCache } from '@/lib/kv-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
    const auth = request.headers.get('authorization') || '';
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const result = await scanOrders();
        await saveOrdersCache(result);
        return NextResponse.json({ ok: true, drops: result.drops.length, syncedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Cron sync failed:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
