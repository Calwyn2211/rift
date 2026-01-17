import { NextResponse } from 'next/server';
import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const config = {
    imap: {
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 20000 
    }
};

export async function GET() {
    try {
        const connection = await imap.connect(config);
        await connection.openBox('INBOX');

        const delay = 14 * 24 * 3600 * 1000;
        const searchCriteria = [['SINCE', new Date(Date.now() - delay).toISOString()], ['HEADER', 'SUBJECT', 'Order']];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false }; 
        const messages = await connection.search(searchCriteria, fetchOptions);

        let orderMap = new Map();

        for (const item of messages) {
            try {
                const all = item.parts.find(p => p.which === '');
                const id = item.attributes.uid;
                const parsed = await simpleParser("Imap-Id: "+id+"\r\n" + all.body);

                const subject = parsed.subject || "No Subject";
                const subLow = subject.toLowerCase();
                const fromRaw = parsed.from?.text || "Unknown";
                let storeName = fromRaw.replace(/<.*>/, '').replace(/"/g, '').trim();

                // 1. STRICT FILTERING
                if (['buy order', 'invoice', 'return', 'points', 'balance'].some(w => subLow.includes(w))) continue;
                
                // HARD BLOCK: Loot Vault Entries
                if (storeName.toLowerCase().includes('loot') && (subLow.includes('entry') || !subject.includes('#'))) continue;

                const isDelivered = subLow.includes('delivered');
                const isShipping = !isDelivered && (subLow.includes('ship') || subLow.includes('way') || subLow.includes('transit'));
                const isCancellation = ['cancel', 'refund', 'void', 'decline', 'unsuccessful'].some(w => subLow.includes(w));
                const isConfirmation = ['confirmed', 'thank', '#'].some(w => subLow.includes(w)) && !isShipping && !isDelivered && !isCancellation;

                if (!isConfirmation && !isShipping && !isCancellation && !isDelivered) continue;

                // 2. EXTRACT ORDER ID
                let orderId = "Unknown";
                const idMatch = subject.match(/(?:#|Order\s+)([A-Z0-9-]{3,})/i);
                if (idMatch && /\d/.test(idMatch[1])) { 
                    orderId = idMatch[1];
                } else { 
                    orderId = `MSG-${id}`; 
                }
                
                const uniqueKey = `${storeName}-${orderId}`;

                // 3. SCRAPE DETAILS
                let details = { name: null, image: null, price: 0, qty: 1, card: "Unknown", address: "Unknown", tracking: null, carrier: null };
                
                const $ = cheerio.load(parsed.html || parsed.textAsHtml || "");
                const textBody = $.text().replace(/\s+/g, ' ').trim(); 

                // CARD
                const cardMatch = textBody.match(/(?:ending|ends)\s+(?:in|with)\s+(\d{4})/i);
                if (cardMatch) details.card = cardMatch[1]; 
                else if (textBody.toLowerCase().includes("paypal")) details.card = "PayPal";

                // TRACKING
                if (isShipping || isDelivered) {
                    const ups = textBody.match(/\b(1Z[0-9A-Z]{16})\b/);
                    const usps = textBody.match(/\b(9[2345]\d{20,24})\b/);
                    const fedex = textBody.match(/\b(\d{12,15})\b/);
                    
                    if (ups) { details.tracking = ups[1]; details.carrier = "UPS"; }
                    else if (usps) { details.tracking = usps[1]; details.carrier = "USPS"; }
                    else if (fedex) { details.tracking = fedex[1]; details.carrier = "FedEx"; }
                }

                // PRODUCT & ADDRESS (Confirmation only)
                if (isConfirmation) {
                    $('br').replaceWith(' '); 
                    let addressFound = false;
                    $('*').each((i, el) => {
                        if (addressFound) return;
                        const text = $(el).text().trim().toLowerCase();
                        if (text === 'shipping address' || text === 'shipping to') {
                            let candidate = $(el).next().text().trim() || $(el).parent().next().text().trim() || $(el).closest('div').next().text().trim();
                            if (candidate && candidate.length > 10) { details.address = candidate.replace(/\s+/g, ' ').trim().substring(0, 120); addressFound = true; }
                        }
                    });

                    $('img').each((i, el) => {
                        if (details.name) return;
                        const src = $(el).attr('src');
                        if (!src || src.match(/(facebook|twitter|instagram|logo|spacer|tracker|icon|social|brand)/i)) return;
                        if (!src.includes('cdn.shopify') && !src.includes('products')) return;
                        details.image = src;
                        const row = $(el).closest('tr');
                        if (row.length > 0) {
                            const cells = row.find('td');
                            let rawText = cells.length >= 2 ? cells.eq(1).text().trim() : row.text().trim();
                            let rawPrice = cells.last().text().trim();
                            const qtyMatch = rawText.match(/(?:x|×|Qty:)\s*(\d+)/i);
                            if (qtyMatch) { details.qty = parseInt(qtyMatch[1]); rawText = rawText.replace(qtyMatch[0], '').trim(); }
                            details.name = rawText.replace(/\s+/g, ' ').trim();
                            if (rawPrice) details.price = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;
                        }
                    });
                    
                    if (!details.name) {
                        const fallbackMatch = (parsed.text || "").match(/(\d+)x\s+(.*)/);
                        if (fallbackMatch) { details.qty = parseInt(fallbackMatch[1]); details.name = fallbackMatch[2]; } 
                        else { details.name = `${storeName} Drop`; }
                    }
                    if (details.name && details.name.length > 55) details.name = details.name.substring(0, 55) + "...";
                }

                // EMAIL IDENT
                let rawAddress = null;
                const hmeHeader = parsed.headers.get('x-icloud-hme');
                if (hmeHeader) { const match = hmeHeader.toString().match(/p=([^;]+)/); if (match) rawAddress = match[1]; }
                if (!rawAddress && parsed.to) rawAddress = parsed.to.text;
                if (!rawAddress && parsed.headers.get('delivered-to')) rawAddress = parsed.headers.get('delivered-to');
                const emailMatch = rawAddress ? rawAddress.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/) : null;
                const buyerEmail = emailMatch ? emailMatch[0].toLowerCase() : 'unknown';

                // MERGE
                let existingOrder = orderMap.get(uniqueKey) || {
                    id: orderId, store: storeName, email: buyerEmail, status: 'confirmed', 
                    productName: `${storeName} Drop`, image: null, price: 0, qty: 1, 
                    card: "Unknown", address: "Unknown", tracking: null, carrier: null,
                    deliveryStatus: 'unfulfilled'
                };

                // Update Email if finding a better source (sometimes confirmation has alias, shipping has real)
                if (existingOrder.email === 'unknown' && buyerEmail !== 'unknown') existingOrder.email = buyerEmail;

                if (isCancellation) {
                    existingOrder.status = 'canceled';
                } else if (isDelivered) {
                    existingOrder.deliveryStatus = 'delivered';
                    if (details.tracking) existingOrder.tracking = details.tracking;
                } else if (isShipping) {
                    if (existingOrder.deliveryStatus !== 'delivered') {
                        existingOrder.deliveryStatus = 'shipped';
                    }
                    if (details.tracking) { existingOrder.tracking = details.tracking; existingOrder.carrier = details.carrier; }
                } else {
                    if (existingOrder.status !== 'canceled') existingOrder.status = 'confirmed';
                    if (details.name && !details.name.includes("Drop")) existingOrder.productName = details.name;
                    if (details.image) existingOrder.image = details.image;
                    if (details.price > 0) existingOrder.price = details.price;
                    if (details.qty > 1) existingOrder.qty = details.qty;
                    if (details.card !== "Unknown") existingOrder.card = details.card;
                    if (details.address !== "Unknown") existingOrder.address = details.address;
                }

                orderMap.set(uniqueKey, existingOrder);
            } catch (innerError) {
                console.error("Skipping email due to parse error:", innerError);
                // Continue loop even if one email fails
            }
        }

        connection.end();

        // AGGREGATE
        let productGroups = {};
        let cardStats = {}; let addressStats = {};

        orderMap.forEach((order) => {
            const key = `${order.productName}|${order.store}`;
            if (!productGroups[key]) {
                productGroups[key] = { name: order.productName, store: order.store, image: order.image, totalOrders: 0, totalItems: 0, totalSpend: 0, canceled: 0, confirmed: 0, emails: {} };
            }
            
            productGroups[key].totalOrders++;
            if (order.status === 'canceled') productGroups[key].canceled++;
            else { productGroups[key].confirmed++; productGroups[key].totalItems += order.qty; productGroups[key].totalSpend += order.price; }

            if (!productGroups[key].emails[order.email]) { 
                productGroups[key].emails[order.email] = { 
                    email: order.email, count: 0, canceled: 0, latestPrice: 0, latestQty: 0, packages: [] 
                }; 
            }
            const emailGroup = productGroups[key].emails[order.email];
            emailGroup.count++;
            
            if (order.status === 'canceled') emailGroup.canceled++; 
            else { 
                emailGroup.latestPrice = order.price; 
                emailGroup.latestQty = order.qty;
                emailGroup.packages.push({
                    id: order.id,
                    tracking: order.tracking,
                    carrier: order.carrier,
                    status: order.deliveryStatus
                });
            }

            if (order.card !== "Unknown") {
                if (!cardStats[order.card]) cardStats[order.card] = { last4: order.card, total: 0, canceled: 0 };
                cardStats[order.card].total++; if (order.status === 'canceled') cardStats[order.card].canceled++;
            }
            if (order.address !== "Unknown") {
                if (!addressStats[order.address]) addressStats[order.address] = { address: order.address, total: 0, canceled: 0 };
                addressStats[order.address].total++; if (order.status === 'canceled') addressStats[order.address].canceled++;
            }
        });

        let globalStats = { spend: 0, items: 0, orders: 0 };
        const drops = Object.values(productGroups).map(prod => {
            globalStats.spend += prod.totalSpend;
            globalStats.items += prod.totalItems;
            globalStats.orders += prod.confirmed;
            return { ...prod, breakdown: Object.values(prod.emails).sort((a, b) => b.count - a.count) };
        }).sort((a, b) => b.totalOrders - a.totalOrders);

        const cards = Object.values(cardStats).sort((a, b) => b.canceled - a.canceled);
        const addresses = Object.values(addressStats).sort((a, b) => b.canceled - a.canceled);

        return NextResponse.json({ drops, globalStats, cards, addresses });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}