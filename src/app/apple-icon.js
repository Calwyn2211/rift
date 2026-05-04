import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
    return new ImageResponse(
        (
            <div style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    fontSize: 64,
                    fontWeight: 900,
                    fontStyle: 'italic',
                    letterSpacing: '-0.04em',
                    backgroundImage: 'linear-gradient(to right, #facc15, #ca8a04)',
                    backgroundClip: 'text',
                    color: 'transparent',
                    paddingRight: 6,
                }}>RIFT</div>
            </div>
        ),
        size
    );
}
