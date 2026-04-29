const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const { exec } = require('child_process');

// Wraps page.evaluate so it retries when Cloudflare/SPA navigations destroy
// the execution context mid-call.
async function safeEvaluate(page, fn, ...args) {
    let lastErr;
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            return await page.evaluate(fn, ...args);
        } catch (e) {
            lastErr = e;
            const msg = e.message || '';
            if (msg.includes('Execution context was destroyed') || msg.includes('Target closed')) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
}

// Parse "Monday, Apr 27 at 6:00 PM GMT+2" / "Tuesday, Apr 28" → epoch ms.
// Handles year wrap so a "Jan 5" scraped in December resolves to next year.
function getTimestamp(dateStr) {
    const match = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i);
    if (!match) return 9999999999999;
    const now = new Date();
    let year = now.getFullYear();
    let d = new Date(`${match[1]} ${match[2]}, ${year}`);
    if (isNaN(d.getTime())) return 9999999999999;
    const daysDiff = (now - d) / (1000 * 60 * 60 * 24);
    if (daysDiff > 60) {
        d = new Date(`${match[1]} ${match[2]}, ${year + 1}`);
    }
    return d.getTime();
}

(async () => {
    console.log("🚀 Launching stealth browser...");
    const browser = await puppeteer.launch({ headless: false, args: ['--start-maximized'] });
    const mainPage = await browser.newPage();
    await mainPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("🌐 Navigating to Topps Release Calendar...");
    await mainPage.goto('https://www.topps.com/release-calendar', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("🛑 Waiting up to 3 minutes for page to settle (solve Cloudflare manually in the browser if it shows)...");
    // Poll for product links — survives CF challenge reloads which destroy the execution context.
    const maxWaitMs = 180000;
    const startWait = Date.now();
    let linkCount = 0;
    while (Date.now() - startWait < maxWaitMs) {
        try {
            linkCount = await mainPage.evaluate(() =>
                document.querySelectorAll('a[href^="/pages/"]').length
            );
            if (linkCount > 0) break;
        } catch (e) {
            // Execution context destroyed (CF reload, etc.) — wait and retry.
        }
        await new Promise(r => setTimeout(r, 2500));
    }

    if (linkCount === 0) {
        console.log("⚠️  Still no product links after 3 minutes. Saving debug snapshot...");
        await mainPage.screenshot({ path: './debug-topps.png', fullPage: true }).catch(() => {});
        try {
            const html = await mainPage.content();
            fs.writeFileSync('./debug-topps.html', html);
        } catch {}
        console.log("   Saved debug-topps.png/html — inspect them.");
        await browser.close();
        return;
    }

    console.log(`✅ Page loaded — initial link count: ${linkCount}. Waiting briefly for hydration to settle...`);
    // Short fixed wait — we no longer rely on anchors staying around, so just give
    // React a chance to render the cards and move on.
    await new Promise(r => setTimeout(r, 5000));

    // Step the page through scroll positions externally so a mid-flight nav
    // doesn't kill an in-page setInterval loop.
    let lastHeight = 0;
    for (let i = 0; i < 25; i++) {
        try {
            const h = await safeEvaluate(mainPage, () => {
                window.scrollBy(0, 700);
                return document.body.scrollHeight;
            });
            if (h === lastHeight && i > 3) break;
            lastHeight = h;
        } catch {}
        await new Promise(r => setTimeout(r, 350));
    }
    try { await safeEvaluate(mainPage, () => window.scrollTo(0, 0)); } catch {}
    await new Promise(r => setTimeout(r, 800));

    const counts = await safeEvaluate(mainPage, () => ({
        anchors: document.querySelectorAll('a[href^="/pages/"]').length,
        headings: document.querySelectorAll('.heading-1').length,
        images: document.querySelectorAll('img[alt]').length,
        url: location.href,
    }));
    console.log(`📊 DOM check: ${counts.anchors} product links, ${counts.headings} titles, ${counts.images} images. URL=${counts.url}`);

    // Walk through section headers + titles in DOM order. Section headers
    // (e.g. "Apr 26 – May 10, 2026") are used as a fallback date when a card
    // shows a live countdown that overwrites the per-card date text.
    const cards = await safeEvaluate(mainPage, () => {
        const out = [];
        const seenNames = new Set();
        const monthRx = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

        const markers = Array.from(document.querySelectorAll('.heading-3.text-primary, .heading-1'));
        let currentSection = null;

        for (const el of markers) {
            const text = (el.innerText || '').replace(/\s+/g, ' ').trim();

            // Section header with a month → remember as fallback date.
            if (el.classList.contains('heading-3') && monthRx.test(text)) {
                currentSection = text;
                continue;
            }
            if (!el.classList.contains('heading-1')) continue;

            // Filter out countdown digits / labels masquerading as titles.
            if (!text || text.length < 5) continue;
            if (/^\d+$/.test(text)) continue;

            if (seenNames.has(text)) continue;

            // Walk up to find a card container that also holds an <img alt>.
            let card = el.parentElement;
            let attempts = 0;
            while (card && card !== document.body && attempts < 10) {
                if (card.querySelector('img[alt]')) break;
                card = card.parentElement;
                attempts++;
            }
            if (!card) continue;

            // Prefer a date inside the card; fall back to the section header's
            // date range if the card is showing a countdown.
            const cardDateEl = Array.from(card.querySelectorAll('.ui-2'))
                .find(d => monthRx.test(d.innerText || ''));
            const date = cardDateEl ? cardDateEl.innerText.trim() : (currentSection || 'TBA');

            const anchor = card.querySelector('a[href*="/pages/"]');
            const rawHref = anchor ? anchor.getAttribute('href') : null;
            const href = rawHref
                ? (rawHref.startsWith('http') ? rawHref : 'https://www.topps.com' + rawHref)
                : null;

            const hasPreorderBadge = Array.from(card.querySelectorAll('span'))
                .some(s => (s.innerText || '').trim().toLowerCase() === 'pre-order');

            // Pull the product image. Shopify uses srcset for responsive sizes,
            // so prefer currentSrc (actually-loaded), then src, then the widest
            // entry in srcset. Skip 1x1 tracking pixels and data: URLs.
            let image = null;
            const img = card.querySelector('img[alt]');
            if (img) {
                const candidates = [];
                if (img.currentSrc) candidates.push(img.currentSrc);
                if (img.src) candidates.push(img.src);
                const ss = img.getAttribute('srcset') || img.srcset;
                if (ss) {
                    const widest = ss.split(',').map(s => s.trim()).reduce((best, part) => {
                        const [u, w] = part.split(/\s+/);
                        const wn = parseInt((w || '0').replace(/[^\d]/g, ''), 10) || 0;
                        return wn >= best.w ? { u, w: wn } : best;
                    }, { u: null, w: 0 });
                    if (widest.u) candidates.push(widest.u);
                }
                for (const c of candidates) {
                    if (!c || c.startsWith('data:')) continue;
                    image = c.startsWith('//') ? 'https:' + c : c;
                    break;
                }
            }

            seenNames.add(text);
            out.push({ href, name: text, date, hasPreorderBadge, image });
        }

        return out;
    });

    console.log(`🎯 Found ${cards.length} unique cards on calendar.`);

    if (cards.length === 0) {
        console.log("❌ No cards detected. Saving debug snapshot...");
        await mainPage.screenshot({ path: './debug-topps.png', fullPage: true }).catch(() => {});
        const html = await mainPage.content();
        fs.writeFileSync('./debug-topps.html', html);
        console.log("   Saved debug-topps.png and debug-topps.html — open these to see what the scraper actually saw.");
        await browser.close();
        return;
    }

    let releases = [];

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        let type = card.hasPreorderBadge ? 'PRE-ORDER' : 'MAIN RELEASE';
        let price = 'TBD';

        if (!card.href) {
            console.log(`   [${i + 1}/${cards.length}] ${card.name} — no link, defaulting to PRE-ORDER.`);
            type = 'PRE-ORDER';
            releases.push({
                id: `topps-${i}-${card.name.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 40)}`,
                date: card.date,
                name: card.name,
                type,
                price,
                image: card.image || null,
                timestamp: getTimestamp(card.date),
            });
            continue;
        }

        console.log(`   Visiting [${i + 1}/${cards.length}] ${card.name}...`);
        try {
            const tab = await browser.newPage();
            await tab.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await tab.goto(card.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await new Promise(r => setTimeout(r, 2000));

            const detail = await tab.evaluate(() => {
                const fullText = (document.body.innerText || '').toLowerCase();
                const isEql = /\beql\b/.test(fullText)
                    || fullText.includes('enter draw')
                    || fullText.includes('eql draw')
                    || fullText.includes('topps eql');
                const hasNotifyMe = Array.from(document.querySelectorAll('button, span'))
                    .some(el => /notify me/i.test(el.innerText || ''));
                const hasAddToCart = Array.from(document.querySelectorAll('button'))
                    .some(el => /add to (cart|bag)/i.test(el.innerText || ''));

                let priceStr = null;
                const priceEl = document.querySelector('.price, .money, [data-testid="product-price"]');
                if (priceEl) priceStr = priceEl.innerText.trim().split('\n')[0];

                // Look for the canonical release date on the product page.
                // Prefer "Monday, Apr 27 at 6:00 PM GMT+2"-style strings, fall back
                // to the first "Apr 27"-style string we can find.
                let dateStr = null;
                const dayMonthRx = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:\s+at\s+[\d:]+\s*(?:AM|PM)?(?:\s+[A-Z]{2,5}[+\-]?\d*)?)?/i;
                const fallbackRx = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/i;
                const candidates = Array.from(document.querySelectorAll('p, span, div, h1, h2, h3, h4'))
                    .map(el => (el.innerText || '').replace(/\s+/g, ' ').trim())
                    .filter(t => t && t.length < 120);
                for (const t of candidates) {
                    const m = t.match(dayMonthRx);
                    if (m) { dateStr = m[0]; break; }
                }
                if (!dateStr) {
                    for (const t of candidates) {
                        const m = t.match(fallbackRx);
                        if (m) { dateStr = m[0]; break; }
                    }
                }

                return { isEql, hasNotifyMe, hasAddToCart, price: priceStr, dateStr };
            });

            if (detail.isEql) {
                type = 'EQL DRAW';
            } else if (card.hasPreorderBadge || (detail.hasNotifyMe && !detail.hasAddToCart)) {
                type = 'PRE-ORDER';
            } else {
                type = 'MAIN RELEASE';
            }
            if (detail.price) price = detail.price;

            // The calendar card's date is unreliable when a countdown is rendered
            // (it falls back to a date range like "Apr 26 – May 10, 2026"). The
            // product page has the canonical date — prefer it when found.
            if (detail.dateStr) card.date = detail.dateStr;

            await tab.close();
        } catch (e) {
            console.log(`   ⚠️  Failed to scrape ${card.name} — assuming PRE-ORDER.`);
            type = 'PRE-ORDER';
        }

        releases.push({
            id: `topps-${i}-${card.name.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 40)}`,
            date: card.date,
            name: card.name,
            type,
            price,
            image: card.image || null,
            timestamp: getTimestamp(card.date),
        });

        await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
    }

    // Dedupe by name (defensive — calendar should already be unique by href).
    const uniqueReleases = [];
    const seenNames = new Set();
    for (const r of releases) {
        if (seenNames.has(r.name)) continue;
        seenNames.add(r.name);
        uniqueReleases.push(r);
    }

    uniqueReleases.sort((a, b) => a.timestamp - b.timestamp);

    fs.writeFileSync('./calendar_data.json', JSON.stringify(uniqueReleases, null, 2));
    console.log(`\n💾 SUCCESS: Saved ${uniqueReleases.length} releases.`);

    await browser.close();

    console.log("\n🚀 Uploading new sorted calendar data to Vercel...");
    exec('git add calendar_data.json && git commit -m "Auto-update sorted calendar data" && git push', (error, stdout, stderr) => {
        if (error) return console.error(`❌ Auto-Upload failed.`);
        console.log(`✅ UPLOAD COMPLETE! Vercel is now building your live app.`);
    });
})();
