import { NextResponse } from 'next/server';
import { addPushSubscription, removePushSubscription } from '@/lib/kv-store';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const body = await request.json();
        if (!body?.endpoint) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
        const added = await addPushSubscription(body);
        return NextResponse.json({ ok: true, added });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const body = await request.json();
        if (!body?.endpoint) return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
        await removePushSubscription(body.endpoint);
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
