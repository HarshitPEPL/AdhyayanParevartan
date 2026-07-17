import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    plugins: [
        viteStaticCopy({
            targets: [
                {
                    // Copy all page HTML, JS, and CSS templates into dist/pages/
                    src: 'pages',
                    dest: '.'
                },
                {
                    // Copy core JS files so dynamic imports work in the APK WebView
                    src: 'core',
                    dest: '.'
                }
            ]
        })
    ],
    build: {
        // Ensure source maps are disabled for a clean production build
        sourcemap: false,
        rollupOptions: {
            input: {
                main: 'index.html'
            }
        }
    }
});
