export default function manifest() {
    return {
        name: 'RIFT',
        short_name: 'RIFT',
        description: 'Trading-card bot purchase tracker',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#facc15',
        icons: [
            { src: '/icon0', sizes: '192x192', type: 'image/png' },
            { src: '/icon1', sizes: '512x512', type: 'image/png' },
        ],
    };
}
