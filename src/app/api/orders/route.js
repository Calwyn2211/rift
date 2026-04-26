import { NextResponse } from 'next/server';
import { getOrdersCache } from '@/lib/kv-store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const cache = await getOrdersCache();
        if (!cache) return NextResponse.json({ cache: null });
        return NextResponse.json({ cache });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
