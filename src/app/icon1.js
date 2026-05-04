import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-900-italic.woff';

export default async function Icon1() {
    const fontData = await fetch(FONT_URL).then(res => {
        if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
        return res.arrayBuffer();
    });

    return new ImageResponse(
        (
            <div style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter',
            }}>
                <div style={{
                    fontSize: 190,
                    fontWeight: 900,
                    fontStyle: 'italic',
                    letterSpacing: '-0.05em',
                    backgroundImage: 'linear-gradient(to right, #facc15, #ca8a04)',
                    backgroundClip: 'text',
                    color: 'transparent',
                    paddingRight: 16,
                }}>RIFT</div>
            </div>
        ),
        {
            ...size,
            fonts: [
                { name: 'Inter', data: fontData, style: 'italic', weight: 900 },
            ],
        }
    );
}
