import { NextResponse } from 'next/server';
import { scanOrders } from '@/lib/order-scanner';
import { saveOrdersCache } from '@/lib/kv-store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const result = await scanOrders();
        try { await saveOrdersCache(result); } catch (e) { console.error('KV cache write failed:', e.message); }
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
