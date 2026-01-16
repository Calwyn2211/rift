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

        let productGroups = {};

        for (const item of messages) {
            const all = item.parts.find(p => p.which === '');
            const id = item.attributes.uid;
            const parsed = await simpleParser("Imap-Id: "+id+"\r\n" + all.body);

            // 1. FILTER
            const subject = parsed.subject || "No Subject";
            const subLow = subject.toLowerCase();
            if (['shipped', 'delivered', 'buy order', 'invoice', 'return', 'entry'].some(w => subLow.includes(w))) continue;
            if (!['confirmed', 'thank', '#'].some(w => subLow.includes(w))) continue;

            // 2. STORE NAME
            const fromRaw = parsed.from?.text || "Unknown";
            let storeName = fromRaw.replace(/<.*>/, '').replace(/"/g, '').trim();

            // 3. SCRAPE DATA
            let productName = null;
            let productImage = null;
            let productPrice = 0; // Float
            let productQty = 1;   // Int

            const $ = cheerio.load(parsed.html || parsed.textAsHtml || "");

            $('img').each((i, el) => {
                if (productName) return;
                const src = $(el).attr('src');
                if (!src || src.match(/(facebook|twitter|instagram|logo|spacer|tracker|icon|social|brand)/i)) return;
                if (!src.includes('cdn.shopify') && !src.includes('products')) return;

                productImage = src;
                const row = $(el).closest('tr');
                if (row.length > 0) {
                    const cells = row.find('td');
                    let rawText = cells.length >= 2 ? cells.eq(1).text().trim() : row.text().trim();
                    let rawPrice = cells.last().text().trim();

                    // Quantity
                    const qtyMatch = rawText.match(/(?:x|×|Qty:)\s*(\d+)/i);
                    if (qtyMatch) {
                        productQty = parseInt(qtyMatch[1]);
                        rawText = rawText.replace(qtyMatch[0], '').trim();
                    }

                    // Title
                    productName = rawText.replace(/\s+/g, ' ').trim();

                    // Price
                    if (rawPrice) {
                        // Remove currency symbols and commas to get a float
                        const cleanPrice = rawPrice.replace(/[^0-9.]/g, '');
                        productPrice = parseFloat(cleanPrice) || 0;
                    }
                }
            });

            // Fallback
            if (!productName) {
                const text = parsed.text || "";
                const match = text.match(/(\d+)x\s+(.*)/);
                if (match) { productQty = parseInt(match[1]); productName = match[2]; } 
                else { productName = `${storeName} Drop`; }
            }

            if (productName.length > 55) productName = productName.substring(0, 55) + "...";

            // 4. IDENTIFY EMAIL
            let rawAddress = null;
            const hmeHeader = parsed.headers.get('x-icloud-hme');
            if (hmeHeader) { const match = hmeHeader.toString().match(/p=([^;]+)/); if (match) rawAddress = match[1]; }
            if (!rawAddress && parsed.to) rawAddress = parsed.to.text;
            if (!rawAddress) rawAddress = parsed.headers.get('delivered-to');

            const emailMatch = rawAddress ? rawAddress.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/) : null;
            const buyerEmail = emailMatch ? emailMatch[0].toLowerCase() : 'unknown';

            // 5. AGGREGATE
            const key = `${productName}|${storeName}`; 
            
            if (!productGroups[key]) {
                productGroups[key] = {
                    name: productName,
                    store: storeName,
                    image: productImage,
                    totalOrders: 0,
                    totalItems: 0,  // Sum of Qty
                    totalSpend: 0,  // Sum of Price
                    canceled: 0,
                    confirmed: 0,
                    emails: {}
                };
            }

            let status = subLow.includes('cancel') ? 'canceled' : 'confirmed';
            
            productGroups[key].totalOrders++;
            if (status === 'confirmed') {
                productGroups[key].confirmed++;
                productGroups[key].totalItems += productQty;
                productGroups[key].totalSpend += productPrice;
            } else {
                productGroups[key].canceled++;
            }

            if (!productGroups[key].emails[buyerEmail]) {
                productGroups[key].emails[buyerEmail] = {
                    email: buyerEmail,
                    count: 0,
                    canceled: 0,
                    latestPrice: productPrice,
                    latestQty: productQty
                };
            }
            productGroups[key].emails[buyerEmail].count++;
            if (status === 'canceled') productGroups[key].emails[buyerEmail].canceled++;
        }

        connection.end();

        // Global Stats Calculation
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