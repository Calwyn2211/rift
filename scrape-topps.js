const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const { exec } = require('child_process');

// FIXED: Correctly parses the date so the sorting algorithm actually works
function getTimestamp(dateStr) {
    const monthRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i;
    const match = dateStr.match(monthRegex);
    if (match) {
        const currentYear = new Date().getFullYear();
        const d = new Date(`${match[1]} ${match[2]}, ${currentYear}`);
        if (!isNaN(d.getTime())) return d.getTime();
    }
    return 9999999999999; // Put TBA/Unknowns at the very bottom
}

(async () => {
    console.log("🚀 Launching stealth browser...");
    const browser = await puppeteer.launch({ headless: false, args:['--start-maximized'] }); 
    const mainPage = await browser.newPage();
    await mainPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("🌐 Navigating to Topps Featured Releases...");
    await mainPage.goto('https://www.topps.com/pages/featured-releases', { waitUntil: 'domcontentloaded' });
    
    console.log("🛑 WAITING 15 SECONDS FOR PAGE TO LOAD / PASS CLOUDFLARE...");
    await new Promise(r => setTimeout(r, 15000));

    // --- 1. GEOMETRIC SELECTION (ONLY "COMING SOON") ---
    const targetLinks = await mainPage.evaluate(() => {
        const urls = new Set();
        const headers = Array.from(document.querySelectorAll('[data-testid="title-section-title"]'));
        const comingSoonHeader = headers.find(h => h.innerText.toLowerCase().includes('coming soon'));
        
        let targetY = 0;
        if (comingSoonHeader) {
            targetY = comingSoonHeader.getBoundingClientRect().top + window.scrollY;
        }

        const items = document.querySelectorAll('[data-listing-item="true"] a');
        items.forEach(a => {
            const rect = a.getBoundingClientRect();
            const y = rect.top + window.scrollY;
            if (y >= (targetY - 50)) {
                const href = a.getAttribute('href');
                if (href && (href.includes('/pages/') || href.includes('/products/'))) {
                    urls.add(href.startsWith('http') ? href : 'https://www.topps.com' + href);
                }
            }
        });
        return Array.from(urls);
    });

    console.log(`🎯 Found ${targetLinks.length} STRICT 'Coming Soon' products. Opening tabs...`);

    if (targetLinks.length === 0) {
        console.log("❌ No links found. Closing browser.");
        await browser.close();
        return;
    }

    let releases =[];

    // --- 2. DEEP CRAWL EACH PAGE ---
    for (let i = 0; i < targetLinks.length; i++) {
        const link = targetLinks[i];
        console.log(`   Scraping[${i + 1}/${targetLinks.length}]...`);
        const tab = await browser.newPage(); 
        
        try {
            await tab.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await new Promise(r => setTimeout(r, 2000));

            const details = await tab.evaluate(() => {
                const titleEl = document.querySelector('.display-1, h1, .heading-1,[data-testid="product-title"]');
                const title = titleEl ? titleEl.innerText.trim() : document.title.split('|')[0].trim();
                
                let price = 'TBD';
                const priceEl = document.querySelector('.price, .money, [data-testid="product-price"]');
                if (priceEl) price = priceEl.innerText.trim().split('\n')[0];

                let statusString = '';
                const statusEl = document.querySelector('.ui-2.text-primary, .subhead-1');
                if (statusEl) statusString = statusEl.innerText.trim();

                const fullBodyText = document.body.innerText.toLowerCase();
                const statusLow = statusString.toLowerCase();
                
                let type = 'MAIN RELEASE'; 
                if (statusLow.includes('eql') || fullBodyText.includes('on eql') || fullBodyText.includes('enter draw')) {
                    type = 'EQL DRAW';
                } else if (statusLow.includes('pre-order') || statusLow.includes('preorder') || fullBodyText.includes('pre-order')) {
                    type = 'PRE-ORDER';
                }

                let dateStr = 'TBA';
                const monthRegex = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|aug|sept|oct|nov|dec)\s+\d{1,2}/i;
                
                if (monthRegex.test(statusString)) {
                    dateStr = statusString;
                } else {
                    const textBlocks = document.querySelectorAll('p, span, h2, h3, h4, div');
                    for (let el of textBlocks) {
                        let txt = el.innerText.toLowerCase();
                        if (txt.includes('available') || txt.includes('release') || txt.includes('dropping')) {
                            if (monthRegex.test(txt) || txt.includes('am ') || txt.includes('pm ')) {
                                let cleanText = el.innerText.trim().replace(/\n/g, ' ');
                                if (cleanText.length > 5 && cleanText.length < 100) {
                                    dateStr = cleanText;
                                    break; 
                                }
                            }
                        }
                    }
                }
                return { name: title, price: price, type: type, date: dateStr };
            });

            if (details.name) {
                let cleanName = details.name.replace(/-\s*Trending Now.*/i, '').trim();
                if (cleanName.includes('2025') || cleanName.includes('2026') || cleanName.toLowerCase().includes('topps') || cleanName.toLowerCase().includes('bowman')) {
                    releases.push({
                        id: `topps-deep-${i}`,
                        date: details.date,
                        name: cleanName,
                        type: details.type,
                        price: details.price,
                        timestamp: getTimestamp(details.date) // This now correctly gets a numeric timestamp!
                    });
                }
            }
        } catch (e) {
            console.log(`   ⚠️ Failed to scrape tab: ${link}`);
        } finally {
            await tab.close(); 
        }
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    }

    // --- 3. SORT CHRONOLOGICALLY & SAVE ---
    const uniqueReleases = Array.from(new Set(releases.map(a => a.name))).map(name => releases.find(a => a.name === name));
    
    // Sort flawlessly using the fixed timestamps
    uniqueReleases.sort((a, b) => a.timestamp - b.timestamp);

    fs.writeFileSync('./calendar_data.json', JSON.stringify(uniqueReleases, null, 2));
    console.log(`\n💾 SUCCESS: Scraped, sorted, and saved ${uniqueReleases.length} strict releases!`);
    await browser.close();

    // --- 4. AUTO-PUSH ---
    console.log("\n🚀 Uploading new sorted calendar data to Vercel...");
    exec('git add calendar_data.json && git commit -m "Auto-update sorted calendar data" && git push', (error, stdout, stderr) => {
        if (error) return console.error(`❌ Auto-Upload failed.`);
        console.log(`✅ UPLOAD COMPLETE! Vercel is now building your live app.`);
    });
})();