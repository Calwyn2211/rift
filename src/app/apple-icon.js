import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
    return new ImageResponse(
        (
            <div style={{
                width: '100%',
                height: '100%',
                background: '#0a0a0a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#facc15',
                fontSize: 130,
                fontWeight: 900,
                fontStyle: 'italic',
                letterSpacing: '-0.05em',
            }}>R</div>
        ),
        size
    );
}
