import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon1() {
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
                fontSize: 380,
                fontWeight: 900,
                fontStyle: 'italic',
                letterSpacing: '-0.05em',
            }}>R</div>
        ),
        size
    );
}
