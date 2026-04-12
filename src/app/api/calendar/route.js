import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Point to the file created by your local scraper
        const filePath = path.join(process.cwd(), 'calendar_data.json');
        let releases =[];
        
        // If the file exists, read it
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf8');
            releases = JSON.parse(fileData);
        }

        // If the file doesn't exist or is empty, use Fallback Data
        if (releases.length === 0) {
            releases =[
              { id: 1, date: '2026-04-22', name: '2026 Bowman Baseball Jumbo Box', type: 'PRE-ORDER', price: '$349.99' },
              { id: 2, date: '2026-05-01', name: '2025-26 Bowman University Chrome Basketball', type: 'LIVE', price: '$149.99' },
              { id: 3, date: '2026-05-14', name: '2026 Topps Heritage Baseball Hobby', type: 'PRE-ORDER', price: '$119.99' },
              { id: 4, date: '2026-05-28', name: '2025-26 Topps Finest Basketball', type: 'LIVE', price: 'TBD' },
            ];
        }

        return NextResponse.json({ releases });

    } catch (error) {
        console.error("Calendar API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}