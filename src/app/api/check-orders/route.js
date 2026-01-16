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

        // --- PHASE 1: PROCESS ALL EMAILS INTO UNIQUE ORDERS ---
        // Map Key: "StoreName-OrderNumber" (Ensures Order #1 from Topps != Order #1 from Amazon)
        let orderMap = new Map();

        for (const item of messages) {
            const all = item.parts.find(p => p.which === '');
            const id = item.attributes.uid;
            const parsed = await simpleParser("Imap-Id: "+id+"\r\n" + all.body);

            // 1. FILTERING
            const subject = parsed.subject || "No Subject";
            const subLow = subject.toLowerCase();
            if (['shipped', 'delivered', 'buy order', 'invoice', 'return', 'entry'].some(w => subLow.includes(w))) continue;
            if (!['confirmed', 'thank', '#', 'cancel', 'refund'].some(w => subLow.includes(w))) continue;

            // 2. IDENTIFY STORE
            const fromRaw = parsed.from?.text || "Unknown";
            let storeName = fromRaw.replace(/<.*>/, '').replace(/"/g, '').trim();

            // 3. EXTRACT ORDER ID (CRITICAL)
            // Look for patterns like: #12345, #US-12345, Order 12345
            let orderId = "Unknown";
            const idMatch = subject.match(/(?:#|Order\s+)([A-Za-z0-9-]+)/i);
            if (idMatch) {
                orderId = idMatch[1];
            } else {
                // Fallback: Use Message ID if no Order ID found (Treat as unique event)
                orderId = `MSG-${id}`; 
            }

            // Create Unique Key for this Order
            const uniqueKey = `${storeName}-${orderId}`;

            // 4. DETERMINE STATUS OF THIS EMAIL
            const cancelKeywords = ['cancel', 'refund', 'void', 'decline', 'unsuccessful'];
            const isCancellation = cancelKeywords.some(w => subLow.includes(w));
            const currentStatus = isCancellation ? 'canceled' : 'confirmed';

            // 5. SCRAPE DETAILS (Product, Price, Image)
            // We only scrape if it's NOT a cancellation (Cancellations usually lack product info)
            let details = { name: null, image: null, price: 0, qty: 1 };
            
            if (!isCancellation) {
                const $ = cheerio.load(parsed.html || parsed.textAsHtml || "");
                
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
                        if (qtyMatch) {
                            details.qty = parseInt(qtyMatch[1]);
                            rawText = rawText.replace(qtyMatch[0], '').trim();
                        }
                        details.name = rawText.replace(/\s+/g, ' ').trim();
                        if (rawPrice) {
                            details.price = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;
                        }
                    }
                });

                // Fallback Text Regex
                if (!details.name) {
                    const text = parsed.text || "";
                    const match = text.match(/(\d+)x\s+(.*)/);
                    if (match) { details.qty = parseInt(match[1]); details.name = match[2]; } 
                    else { details.name = `${storeName} Drop`; }
                }
                if (details.name.length > 55) details.name = details.name.substring(0, 55) + "...";
            }

            // 6. IDENTIFY BUYER EMAIL
            let rawAddress = null;
            const hmeHeader = parsed.headers.get('x-icloud-hme');
            if (hmeHeader) { const match = hmeHeader.toString().match(/p=([^;]+)/); if (match) rawAddress = match[1]; }
            if (!rawAddress && parsed.to) rawAddress = parsed.to.text;
            if (!rawAddress && parsed.headers.get('delivered-to')) rawAddress = parsed.headers.get('delivered-to');
            const emailMatch = rawAddress ? rawAddress.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/) : null;
            const buyerEmail = emailMatch ? emailMatch[0].toLowerCase() : 'unknown';

            // --- MERGE LOGIC ---
            // If order exists in map, we update it. If not, we create it.
            let existingOrder = orderMap.get(uniqueKey) || {
                id: orderId,
                store: storeName,
                email: buyerEmail,
                status: 'confirmed', // Default
                productName: `${storeName} Drop`,
                image: null,
                price: 0,
                qty: 1
            };

            // If this email is a CANCELLATION, it overrides everything to 'canceled'
            if (isCancellation) {
                existingOrder.status = 'canceled';
            } else {
                // If this is a CONFIRMATION, we save the product details
                // BUT we do not overwrite status if it was ALREADY canceled (rare, but possible if processed out of order)
                if (existingOrder.status !== 'canceled') {
                    existingOrder.status = 'confirmed';
                }
                // Always update metadata from the rich confirmation email
                if (details.name && !details.name.includes("Drop")) existingOrder.productName = details.name;
                if (details.image) existingOrder.image = details.image;
                if (details.price > 0) existingOrder.price = details.price;
                if (details.qty > 1) existingOrder.qty = details.qty;
            }

            orderMap.set(uniqueKey, existingOrder);
        }

        connection.end();

        // --- PHASE 2: AGGREGATE UNIQUE ORDERS ---
        // Now we iterate the Unique Orders (not the emails) to build the dashboard
        let productGroups = {};

        orderMap.forEach((order) => {
            const key = `${order.productName}|${order.store}`;

            if (!productGroups[key]) {
                productGroups[key] = {
                    name: order.productName,
                    store: order.store,
                    image: order.image,
                    totalOrders: 0,
                    totalItems: 0,
                    totalSpend: 0,
                    canceled: 0,
                    confirmed: 0,
                    emails: {}
                };
            }

            // Global Counts
            productGroups[key].totalOrders++;
            
            if (order.status === 'canceled') {
                productGroups[key].canceled++;
            } else {
                productGroups[key].confirmed++;
                productGroups[key].totalItems += order.qty;
                productGroups[key].totalSpend += order.price;
            }

            // Email Breakdown
            if (!productGroups[key].emails[order.email]) {
                productGroups[key].emails[order.email] = {
                    email: order.email,
                    count: 0,     // Total unique orders
                    canceled: 0,  // How many were canceled
                    latestPrice: 0,
                    latestQty: 0
                };
            }

            const emailGroup = productGroups[key].emails[order.email];
            emailGroup.count++;
            
            if (order.status === 'canceled') {
                emailGroup.canceled++;
            } else {
                // Only update visual details from confirmed orders
                emailGroup.latestPrice = order.price;
                emailGroup.latestQty = order.qty;
            }
        });

        // Final Sort
        let globalStats = { spend: 0, items: 0, orders: 0 };
        const drops = Object.values(productGroups).map(prod => {
            globalStats.spend += prod.totalSpend;
            globalStats.items += prod.totalItems;
            globalStats.orders += prod.confirmed;
            
            return {
                ...prod,
                breakdown: Object.values(prod.emails).sort((a, b) => b.count - a.count)
            };
        }).sort((a, b) => b.totalOrders - a.totalOrders);

        return NextResponse.json({ drops, globalStats });

    } catch (error) {
        console.error("Scraper Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}