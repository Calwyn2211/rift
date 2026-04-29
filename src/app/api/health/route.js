import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getOrdersCache, getState } from '@/lib/kv-store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [cache, state] = await Promise.all([getOrdersCache(), getState()]);

        let calendarFileMtime = null;
        try {
            const filePath = path.join(process.cwd(), 'calendar_data.json');
            calendarFileMtime = fs.statSync(filePath).mtime.toISOString();
        } catch {}

        return NextResponse.json({
            ordersCachedAt: cache?.cachedAt || null,
            calendarFileMtime,
            stateLastWriteAt: state?._lastWriteAt || null,
            now: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
