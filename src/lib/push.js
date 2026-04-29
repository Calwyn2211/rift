import webpush from 'web-push';
import { getPushSubscriptions, removePushSubscription } from './kv-store';

let configured = false;

function configure() {
    if (configured) return;
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subj = process.env.VAPID_SUBJECT || 'mailto:noreply@rift.local';
    if (!pub || !priv) throw new Error('VAPID keys missing — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
    webpush.setVapidDetails(subj, pub, priv);
    configured = true;
}

export async function sendPushToAll(payload) {
    configure();
    const subs = await getPushSubscriptions();
    if (!subs.length) return { sent: 0, removed: 0, total: 0 };
    const json = JSON.stringify(payload);
    let sent = 0;
    let removed = 0;
    await Promise.all(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(sub, json);
                sent++;
            } catch (e) {
                if (e?.statusCode === 410 || e?.statusCode === 404) {
                    await removePushSubscription(sub.endpoint);
                    removed++;
                } else {
                    console.error('Push send failed:', e?.statusCode, e?.body || e?.message);
                }
            }
        })
    );
    return { sent, removed, total: subs.length };
}
