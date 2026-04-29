import { ImageResponse } from 'next/og';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon0() {
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
                fontSize: 140,
                fontWeight: 900,
                fontStyle: 'italic',
                letterSpacing: '-0.05em',
            }}>R</div>
        ),
        size
    );
}
