import { NextResponse } from 'next/server';
import { getState, patchState, isKvConfigured } from '@/lib/kv-store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const state = await getState();
        return NextResponse.json({ state, kvConfigured: isKvConfigured() });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
        }
        const next = await patchState(body);
        return NextResponse.json({ state: next });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
